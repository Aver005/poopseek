/**
 * Shared core for the bench scripts:
 *   - scripts/bench.ts            (single hard-coded prompt, CLI flags)
 *   - scripts/bench/run.ts        (config-driven multi-prompt overnight run)
 *
 * Holds the timeouts, the screenshot-as-sync-barrier protocol, the
 * retry/wipe-verify machinery, and the per-iteration driver. Keep the
 * functions here pure: they take an explicit `baseUrl`, no module-level
 * mutable state.
 */

import fs from "node:fs/promises";
import path from "node:path";

// ─── Tunables ────────────────────────────────────────────────────────

export const GENERATION_TIMEOUT_MS    = 5 * 60 * 1000;
export const SCREENSHOT_TIMEOUT_MS    = 120_000;
export const VERIFY_EMPTY_TIMEOUT_MS  = 20_000;
export const SCREENSHOT_SCALE         = 0.5;
export const RETRY_ATTEMPTS           = 3;
export const PING_TIMEOUT_MS          = 5_000;

// ─── Pretty logging ──────────────────────────────────────────────────

export const C = {
    reset: "\x1b[0m", dim: "\x1b[2m", bold: "\x1b[1m",
    green: "\x1b[32m", red: "\x1b[31m", yellow: "\x1b[33m",
    cyan: "\x1b[36m", magenta: "\x1b[35m", blue: "\x1b[34m",
};
export const log    = (s: string) => process.stdout.write(s + "\n");
export const dim    = (s: string) => C.dim     + s + C.reset;
export const bold   = (s: string) => C.bold    + s + C.reset;
export const green  = (s: string) => C.green   + s + C.reset;
export const red    = (s: string) => C.red     + s + C.reset;
export const yellow = (s: string) => C.yellow  + s + C.reset;
export const cyan   = (s: string) => C.cyan    + s + C.reset;
export const magenta = (s: string) => C.magenta + s + C.reset;

export function ts(): string
{
    return new Date().toISOString().split("T")[1]!.slice(0, 12);
}

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function formatDuration(ms: number): string
{
    if (ms < 1000) return `${ms}ms`;
    const s = Math.round(ms / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    const rem = s % 60;
    if (m < 60) return rem === 0 ? `${m}m` : `${m}m${rem}s`;
    const h = Math.floor(m / 60);
    const mRem = m % 60;
    return mRem === 0 ? `${h}h` : `${h}h${mRem}m`;
}

export async function sleepWithCountdown(ms: number, label: string): Promise<void>
{
    if (ms <= 0) return;
    const end = Date.now() + ms;
    const tick = ms < 5_000 ? 250 : 1000;
    while (true)
    {
        const remaining = Math.max(0, end - Date.now());
        process.stdout.write(`\r${C.dim}${label}  ${formatDuration(remaining)} remaining…${C.reset}    `);
        if (remaining <= 0) break;
        await sleep(Math.min(tick, remaining));
    }
    process.stdout.write("\r" + " ".repeat(64) + "\r");
}

// ─── Server probes ───────────────────────────────────────────────────

export async function checkServer(baseUrl: string): Promise<void>
{
    try
    {
        const r = await fetch(`${baseUrl}/v1/status`);
        if (!r.ok) throw new Error(`status ${r.status}`);
        const data = await r.json() as { ok: boolean; pendingOps?: number; pendingScreenshots?: number };
        if (!data.ok) throw new Error("status returned ok=false");
        log(dim(`  server alive — pendingOps=${data.pendingOps ?? "?"} pendingScreenshots=${data.pendingScreenshots ?? "?"}`));
    }
    catch (err)
    {
        log(red(`✗ Figma server not reachable at ${baseUrl}`));
        log(dim(`  Start it with: bun start --figma`));
        log(dim(`  Error: ${err instanceof Error ? err.message : String(err)}`));
        process.exit(1);
    }
}

/**
 * Confirm the plugin is alive AND running a build that knows about the
 * `request_screenshot` op type. Without this, every iteration would
 * time out at the screenshot step (see bench-runs/2026-05-11T23-46-54
 * for the historical evidence).
 */
export async function pingPluginScreenshot(baseUrl: string): Promise<void>
{
    log(dim(`  → ping plugin via /v1/screenshot (${PING_TIMEOUT_MS}ms timeout) …`));
    try
    {
        const r = await fetch(`${baseUrl}/v1/screenshot`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ target: "page", scale: 0.25, timeoutMs: PING_TIMEOUT_MS }),
        });
        const data = await r.json() as ScreenshotResponse;
        if (data.error && /timeout/i.test(data.error))
        {
            log("");
            log(red(`✗ Plugin did not respond to request_screenshot within ${PING_TIMEOUT_MS}ms.`));
            log(yellow(`  → Most likely the Figma plugin is running an old build without the`));
            log(yellow(`    "request_screenshot" op handler.`));
            log(dim(`     Fix: in Figma, Plugins → Development → PoopSeek → Hot reload plugin`));
            log(dim(`          (or close and reopen the plugin window).`));
            process.exit(1);
        }
        if (data.error)
        {
            log(yellow(`  ⚠ ping returned error: ${data.error}`));
            log(yellow(`    (likely "no nodes to screenshot" on empty canvas — ok if you wiped beforehand)`));
            return;
        }
        const n = data.images?.length ?? 0;
        log(green(`  ✓ plugin responded`) + dim(` — ${n} image(s) on current page`));
    }
    catch (err)
    {
        log(red(`✗ ping failed: ${err instanceof Error ? err.message : String(err)}`));
        process.exit(1);
    }
}

// ─── Server protocol types ───────────────────────────────────────────

export interface ChatLegacyResponse
{
    sessionId: string;
    text: string;
    ops: unknown[];
    error?: string;
}

export interface ScreenshotResponse
{
    screenshotId: string;
    images?: string[];
    error?: string;
}

export interface ScreenshotResult
{
    images: string[];
    /** True iff the plugin reported "no nodes to screenshot" — current page is empty. */
    empty: boolean;
}

// ─── Op helpers ──────────────────────────────────────────────────────

export async function runGeneration(baseUrl: string, prompt: string): Promise<ChatLegacyResponse>
{
    // No `Accept: text/event-stream` → legacy JSON path: server pushes
    // ops to the global pendingOps queue and returns once the builder
    // finishes. Plugin's standard /v1/poll-ops loop picks them up.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), GENERATION_TIMEOUT_MS);
    try
    {
        const r = await fetch(`${baseUrl}/v1/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: prompt }),
            signal: controller.signal,
        });
        const text = await r.text();
        let data: ChatLegacyResponse;
        try { data = JSON.parse(text) as ChatLegacyResponse; }
        catch { throw new Error(`server returned non-JSON (status ${r.status}):\n${text.slice(0, 400)}`); }
        if (!r.ok || data.error) throw new Error(data.error || `chat failed (status ${r.status})`);
        return data;
    }
    finally { clearTimeout(timer); }
}

/**
 * Request a screenshot. Also doubles as a synchronization barrier — the
 * plugin processes ops via executeOpsChain strictly sequentially, so
 * when this call returns, every preceding op (chat-builder ops or
 * wipe_design) is fully applied. This is why the rest of the script
 * never needs `sleep` to wait for "rendering to finish".
 *
 * "no nodes to screenshot" is treated as a normal empty-canvas signal,
 * not a failure — the wipe-verify path relies on this.
 */
export async function requestScreenshot(baseUrl: string, opts: {
    timeoutMs?: number;
    scale?: number;
    target?: "page" | "selection";
} = {}): Promise<ScreenshotResult>
{
    const r = await fetch(`${baseUrl}/v1/screenshot`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            target: opts.target ?? "page",
            scale: opts.scale ?? SCREENSHOT_SCALE,
            timeoutMs: opts.timeoutMs ?? SCREENSHOT_TIMEOUT_MS,
        }),
    });
    const data = await r.json() as ScreenshotResponse;
    if (data.error)
    {
        if (/no nodes to screenshot/i.test(data.error)) return { images: [], empty: true };
        throw new Error(data.error);
    }
    if (!r.ok) throw new Error(`screenshot HTTP ${r.status}`);
    const images = data.images ?? [];
    return { images, empty: images.length === 0 };
}

export async function captureScreenshot(baseUrl: string): Promise<string[]>
{
    const result = await requestScreenshot(baseUrl);
    if (result.empty) throw new Error("screenshot returned no images — current page is empty (did wipe fire before screenshot was queued?)");
    return result.images;
}

export async function postWipeOp(baseUrl: string): Promise<void>
{
    const r = await fetch(`${baseUrl}/v1/ops`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ops: [{ type: "wipe_design" }] }),
    });
    if (!r.ok) throw new Error(`wipe HTTP ${r.status}`);
}

/**
 * Wipe + hard-verify the canvas is actually empty.
 *
 * Plugin reports "no nodes to screenshot" iff currentPage.children is
 * truly empty. Throwing on non-empty lets `withRetry` re-issue the wipe
 * — we've observed Figma occasionally swallowing the op (a node refuses
 * to remove, a UI Kit page lingers, etc.).
 */
export async function wipeAndVerify(baseUrl: string): Promise<void>
{
    await postWipeOp(baseUrl);
    const result = await requestScreenshot(baseUrl, {
        scale: 0.1,
        timeoutMs: VERIFY_EMPTY_TIMEOUT_MS,
    });
    if (!result.empty)
        throw new Error(`wipe ran but canvas still has ${result.images.length} top-level node(s)`);
}

export async function withRetry<T>(label: string, fn: () => Promise<T>, maxAttempts: number = RETRY_ATTEMPTS): Promise<T>
{
    let lastErr: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt++)
    {
        if (attempt > 1) log(yellow(`  ↻ ${label}: retry ${attempt}/${maxAttempts} …`));
        try { return await fn(); }
        catch (err)
        {
            lastErr = err;
            const msg = err instanceof Error ? err.message : String(err);
            log(red(`  ✗ ${label} attempt ${attempt}/${maxAttempts} failed:`) + dim(`  ${msg}`));
        }
    }
    throw lastErr instanceof Error
        ? lastErr
        : new Error(typeof lastErr === "string" ? lastErr : "unknown error");
}

// ─── One iteration ───────────────────────────────────────────────────

export interface IterationOutcome
{
    index: number;
    ok: boolean;
    durationMs: number;
    error?: string;
    jsxBytes: number;
    imageCount: number;
    sessionId?: string;
    opCount: number;
    outDir: string;
}

export interface IterationParams
{
    baseUrl: string;
    prompt: string;
    runDir: string;
    index: number;     // 1-based position within its batch
    total: number;     // total iterations in the batch (for header display)
    skipWipe: boolean; // true → don't wipe between iterations
    isLast: boolean;   // last iteration in the batch → wipe is skipped
    header?: string;   // optional label prefix shown in the run header
}

export async function runIteration(p: IterationParams): Promise<IterationOutcome>
{
    await fs.mkdir(p.runDir, { recursive: true });
    const tStart = Date.now();

    const headPrefix = p.header ? p.header + " · " : "";
    log(bold(`▶ ${headPrefix}Run ${p.index}/${p.total}`) + dim(`  [${ts()}]`));

    let runOk = false;
    let runError: string | undefined;
    let jsxBytes = 0;
    let imageCount = 0;
    let sessionId: string | undefined;
    let opCount = 0;

    let jsx: string | undefined;
    try
    {
        log(dim(`  → /v1/chat …`));
        const chat = await withRetry("generate", () => runGeneration(p.baseUrl, p.prompt));
        jsx = chat.text || "";
        jsxBytes = jsx.length;
        opCount = chat.ops.length;
        sessionId = chat.sessionId;
        log(green(`  ✓ chat done`) + dim(`  sessionId=${chat.sessionId.slice(0, 8)} jsx=${jsx.length}b ops=${chat.ops.length}`));
        await fs.writeFile(path.join(p.runDir, "result.jsx"), jsx, "utf-8");
    }
    catch (err)
    {
        runError = `generate failed after ${RETRY_ATTEMPTS} attempts: ${err instanceof Error ? err.message : String(err)}`;
        log(red(`  ✗ skip iteration — ${runError}`));
    }

    if (jsx !== undefined && !runError)
    {
        try
        {
            log(dim(`  → /v1/screenshot (also acts as sync barrier) …`));
            const images = await withRetry("screenshot", () => captureScreenshot(p.baseUrl));
            imageCount = images.length;
            log(green(`  ✓ screenshot`) + dim(`  ${images.length} image(s)`));
            for (let k = 0; k < images.length; k++)
            {
                const buf = Buffer.from(images[k]!, "base64");
                await fs.writeFile(path.join(p.runDir, `page-${k + 1}.png`), buf);
            }
            runOk = true;
        }
        catch (err)
        {
            runError = `screenshot failed after ${RETRY_ATTEMPTS} attempts: ${err instanceof Error ? err.message : String(err)}`;
            log(red(`  ✗ skip iteration — ${runError}`));
        }
    }

    const durationMs = Date.now() - tStart;
    await fs.writeFile(path.join(p.runDir, "meta.json"), JSON.stringify({
        index: p.index, ok: runOk, durationMs,
        ...(runError !== undefined ? { error: runError } : {}),
        jsxBytes, imageCount,
        ...(sessionId !== undefined ? { sessionId } : {}),
        opCount,
    }, null, 2), "utf-8");

    if (!p.skipWipe && !p.isLast)
    {
        try
        {
            log(dim(`  → wipe_design (clear nodes + theme vars + text styles) …`));
            await withRetry("wipe", () => wipeAndVerify(p.baseUrl));
            log(green(`  ✓ canvas verified empty`));
        }
        catch (err)
        {
            log(yellow(`  ⚠ wipe failed after ${RETRY_ATTEMPTS} attempts: ${err instanceof Error ? err.message : String(err)}`));
            log(yellow(`     continuing — next run may collide with leftover content`));
        }
    }

    return {
        index: p.index, ok: runOk, durationMs,
        ...(runError !== undefined ? { error: runError } : {}),
        jsxBytes, imageCount,
        ...(sessionId !== undefined ? { sessionId } : {}),
        opCount,
        outDir: p.runDir,
    };
}
