#!/usr/bin/env bun
/**
 * Run N sequential generations of the same prompt against the running
 * Figma server, saving the produced JSX + a full-page PNG export from
 * Figma after each one, then wiping the canvas (frames + theme vars +
 * text styles) before the next iteration.
 *
 * Usage:
 *   1. Start the Figma server + open the plugin in Figma:
 *        bun start --figma
 *      (or hit /figma start inside the CLI)
 *   2. Run this script:
 *        bun run scripts/bench.ts
 *   3. Results land in `bench-runs/<ISO timestamp>/run-NN/{result.jsx,page-M.png,meta.json}`.
 *
 * Knobs:
 *   PROMPT           — the prompt every iteration sends (see constant below)
 *   RUN_COUNT        — number of iterations
 *   GENERATION_TIMEOUT_MS / RENDER_SETTLE_MS / SCREENSHOT_TIMEOUT_MS
 *   --port <n>       — server port (default 7331)
 *   --no-wipe        — skip the wipe between iterations (visually inspect afterwards)
 *   --cooldown <t>   — pause between iterations to dodge LLM rate-limits.
 *                       Accepts "30" (=30s), "90s", "2m", "1500ms".
 *                       Pause happens after the wipe, before the next chat call.
 *
 * Architecture: this script talks ONLY to the HTTP server. The Figma
 * plugin handles screenshot export and wipe via existing op handlers
 * (request_screenshot, wipe_design).
 */

import fs from "node:fs/promises";
import path from "node:path";

// ─── Configure here ─────────────────────────────────────────────────

const PROMPT = `
Несколько экранов мобильного приложения по доставке пиццы в небошом Российской городе.
Как референс используй ДоДо пицца.
Доминирующий цвет - фиолетовый. Современный молодёжный дизайн.
Экраны:
- Главная экрана приложения
- Страница заказа пиццы
- Страница заказа пиццы с детализацией
- Страница оплаты
- Страница оформленного заказа
`;

const RUN_COUNT = 10;
const GENERATION_TIMEOUT_MS  = 5 * 60 * 1000;   // chat endpoint hard ceiling
const SCREENSHOT_TIMEOUT_MS  = 120_000;          // full export of complex multi-screen designs at scale=0.5
const VERIFY_EMPTY_TIMEOUT_MS = 20_000;          // verify-empty screenshot (canvas should be tiny)
const SCREENSHOT_SCALE       = 0.5;              // half-res PNGs — readable, half the bytes, dodges memory stalls on giant frames
const RETRY_ATTEMPTS         = 3;
const COOLDOWN_MS_DEFAULT    = 100;              // pause before next iteration (rate-limit)

// ─── CLI args ────────────────────────────────────────────────────────

function argValue(flag: string): string | undefined
{
    const i = process.argv.indexOf(flag);
    return i !== -1 ? process.argv[i + 1] : undefined;
}

const PORT = Number(argValue("--port") ?? 7331);
const SKIP_WIPE = process.argv.includes("--no-wipe");

// Cooldown before the next generation starts. Accepts plain seconds
// ("--cooldown 30") or units ("--cooldown 90s" / "2m" / "1500ms"). The
// pause happens AFTER the wipe (so the canvas is already clean), which
// gives the LLM provider time to recover from rate-limit windows
// between identical-prompt requests.
const COOLDOWN_MS = (() =>
{
    const raw = argValue("--cooldown");
    if (raw === undefined) return COOLDOWN_MS_DEFAULT;
    const m = /^(\d+(?:\.\d+)?)(ms|s|m)?$/.exec(raw.trim());
    if (!m) { console.error(`invalid --cooldown value: ${raw}`); process.exit(1); }
    const n = Number(m[1]);
    const unit = m[2] ?? "s";
    if (unit === "ms") return Math.round(n);
    if (unit === "m")  return Math.round(n * 60_000);
    return Math.round(n * 1000);
})();

const BASE_URL = `http://localhost:${PORT}`;

// ─── Pretty logging ──────────────────────────────────────────────────

const C = {
    reset: "\x1b[0m", dim: "\x1b[2m", bold: "\x1b[1m",
    green: "\x1b[32m", red: "\x1b[31m", yellow: "\x1b[33m",
    cyan: "\x1b[36m", magenta: "\x1b[35m", blue: "\x1b[34m",
};
const log = (s: string) => process.stdout.write(s + "\n");
const dim = (s: string) => C.dim + s + C.reset;
const bold = (s: string) => C.bold + s + C.reset;
const green = (s: string) => C.green + s + C.reset;
const red = (s: string) => C.red + s + C.reset;
const yellow = (s: string) => C.yellow + s + C.reset;
const cyan = (s: string) => C.cyan + s + C.reset;
const magenta = (s: string) => C.magenta + s + C.reset;

function ts(): string
{
    return new Date().toISOString().split("T")[1]!.slice(0, 12);
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function formatDuration(ms: number): string
{
    if (ms < 1000) return `${ms}ms`;
    const s = Math.round(ms / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return rem === 0 ? `${m}m` : `${m}m${rem}s`;
}

async function sleepWithCountdown(ms: number, label: string): Promise<void>
{
    if (ms <= 0) return;
    const end = Date.now() + ms;
    const tick = ms < 5_000 ? 250 : 1000;
    // eslint-disable-next-line no-constant-condition
    while (true)
    {
        const remaining = Math.max(0, end - Date.now());
        const line = `\r${C.dim}${label}  ${formatDuration(remaining)} remaining…${C.reset}    `;
        process.stdout.write(line);
        if (remaining <= 0) break;
        await sleep(Math.min(tick, remaining));
    }
    process.stdout.write("\r" + " ".repeat(60) + "\r");
}

// ─── Server helpers ──────────────────────────────────────────────────

async function checkServer(): Promise<void>
{
    try
    {
        const r = await fetch(`${BASE_URL}/v1/status`);
        if (!r.ok) throw new Error(`status ${r.status}`);
        const data = await r.json() as { ok: boolean; pendingOps?: number; pendingScreenshots?: number };
        if (!data.ok) throw new Error("status returned ok=false");
        log(dim(`  server alive — pendingOps=${data.pendingOps ?? "?"} pendingScreenshots=${data.pendingScreenshots ?? "?"}`));
    }
    catch (err)
    {
        log(red(`✗ Figma server not reachable at ${BASE_URL}`));
        log(dim(`  Start it with: bun start --figma`));
        log(dim(`  Error: ${err instanceof Error ? err.message : String(err)}`));
        process.exit(1);
    }
}

/**
 * Pre-flight: confirm the plugin is actually wired up to respond to the
 * `request_screenshot` op type before we burn an hour of LLM time only
 * to find every iteration timing out (which is exactly the failure mode
 * that produced bench-runs/2026-05-11T23-46-54-341Z — old plugin code
 * cached in Figma's memory, no screenshot handler, every screenshot
 * call hit the 60s timeout). A 5-second roundtrip is enough — if the
 * plugin is alive AND has the handler, it responds in <1s. If not, we
 * fail fast with a clear hint.
 */
async function pingPluginScreenshot(): Promise<void>
{
    log(dim(`  → ping plugin via /v1/screenshot (5s timeout) …`));
    try
    {
        const r = await fetch(`${BASE_URL}/v1/screenshot`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ target: "page", scale: 0.25, timeoutMs: 5000 }),
        });
        const data = await r.json() as ScreenshotResponse;
        if (data.error && /timeout/i.test(data.error))
        {
            log("");
            log(red(`✗ Plugin did not respond to request_screenshot within 5s.`));
            log(yellow(`  → Most likely the Figma plugin is running an old build without the`));
            log(yellow(`    "request_screenshot" op handler.`));
            log(dim(`     Fix: in Figma, Plugins → Development → PoopSeek → Hot reload plugin`));
            log(dim(`          (or close and reopen the plugin window).`));
            log(dim(`     Alternatively the plugin window is closed entirely — open it.`));
            process.exit(1);
        }
        if (data.error)
        {
            log(yellow(`  ⚠ ping returned error: ${data.error}`));
            log(yellow(`    (might be "no nodes to screenshot" on empty canvas — ok if you wiped beforehand)`));
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

interface ChatLegacyResponse
{
    sessionId: string;
    text: string;
    ops: unknown[];
    error?: string;
}

async function runGeneration(): Promise<ChatLegacyResponse>
{
    // No `Accept: text/event-stream` → server uses the legacy JSON path,
    // pushes ops to the global pendingOps queue, and returns once the
    // builder finishes. Plugin's standard /v1/poll-ops loop picks them
    // up and applies them on the next 800ms tick.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), GENERATION_TIMEOUT_MS);
    try
    {
        const r = await fetch(`${BASE_URL}/v1/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: PROMPT }),
            signal: controller.signal,
        });

        const text = await r.text();
        let data: ChatLegacyResponse;
        try { data = JSON.parse(text) as ChatLegacyResponse; }
        catch
        {
            throw new Error(`server returned non-JSON (status ${r.status}):\n${text.slice(0, 400)}`);
        }

        if (!r.ok || data.error)
            throw new Error(data.error || `chat failed (status ${r.status})`);

        return data;
    }
    finally
    {
        clearTimeout(timer);
    }
}

interface ScreenshotResponse
{
    screenshotId: string;
    images?: string[];
    error?: string;
}

interface ScreenshotResult
{
    images: string[];
    /** True when the plugin reported "no nodes to screenshot" — current page is empty. */
    empty: boolean;
}

/**
 * Request a screenshot. Doubles as a synchronization barrier: the
 * plugin serializes all op-batches through executeOpsChain, so when
 * this call returns, every preceding op (chat-builder ops, wipe_design,
 * etc.) has been fully applied. That's why this is the *only* place
 * the script waits — no blind sleeps elsewhere.
 *
 * Treats "no nodes to screenshot" not as failure but as the signal
 * for an empty canvas — used by the wipe-verify path.
 */
async function requestScreenshot(opts: {
    timeoutMs?: number;
    scale?: number;
    target?: "page" | "selection";
}): Promise<ScreenshotResult>
{
    const body = {
        target: opts.target ?? "page",
        scale: opts.scale ?? SCREENSHOT_SCALE,
        timeoutMs: opts.timeoutMs ?? SCREENSHOT_TIMEOUT_MS,
    };
    const r = await fetch(`${BASE_URL}/v1/screenshot`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
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

async function captureScreenshot(): Promise<string[]>
{
    const result = await requestScreenshot({});
    if (result.empty) throw new Error("screenshot returned no images — current page is empty (did wipe fire before the screenshot was queued?)");
    return result.images;
}

async function postWipeOp(): Promise<void>
{
    const r = await fetch(`${BASE_URL}/v1/ops`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ops: [{ type: "wipe_design" }] }),
    });
    if (!r.ok) throw new Error(`wipe HTTP ${r.status}`);
}

/**
 * Wipe the canvas AND verify it's actually empty afterwards.
 *
 * The verification screenshot is itself a sync barrier: executeOpsChain
 * in the plugin runs ops strictly sequentially across batches, so the
 * screenshot only resolves after wipe_design has actually executed. If
 * the screenshot reports `empty=true` ("no nodes to screenshot"), we
 * know the page is clean. If not, wipe partially failed (a node refused
 * to remove, or — observed in practice — Figma occasionally swallows
 * the op) and we let the caller retry.
 */
async function wipeAndVerify(): Promise<void>
{
    await postWipeOp();
    const result = await requestScreenshot({
        scale: 0.1,
        timeoutMs: VERIFY_EMPTY_TIMEOUT_MS,
    });
    if (!result.empty)
        throw new Error(`wipe ran but canvas still has ${result.images.length} top-level node(s)`);
}

/**
 * Run `fn` up to `maxAttempts` times. Each failed attempt is logged so
 * the user sees the recovery trail in the terminal. Throws the last
 * error if every attempt fails — caller decides whether to skip this
 * iteration or abort the whole run.
 */
async function withRetry<T>(label: string, fn: () => Promise<T>, maxAttempts: number = RETRY_ATTEMPTS): Promise<T>
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

// ─── Main loop ───────────────────────────────────────────────────────

async function main(): Promise<void>
{
    log("");
    log(bold(magenta("◆ PoopSeek benchmark"))
        + dim(`  ${RUN_COUNT} iterations @ ${BASE_URL}`)
        + (COOLDOWN_MS > 0 ? dim(`  · cooldown=${formatDuration(COOLDOWN_MS)}`) : "")
        + (SKIP_WIPE ? dim(`  · --no-wipe`) : ""));
    log(dim("─".repeat(60)));
    log(cyan("Prompt:"));
    log(dim(PROMPT.split("\n").slice(0, 3).map((l) => "  " + l).join("\n")));
    log(dim(`  …(${PROMPT.length} chars total)`));
    log("");

    await checkServer();
    await pingPluginScreenshot();

    const startedAt = new Date().toISOString().replace(/[:.]/g, "-");
    const runRoot = path.resolve(process.cwd(), "assets", "bench-runs", startedAt);
    await fs.mkdir(runRoot, { recursive: true });
    log(dim(`  output dir: ${runRoot}`));
    log("");

    const summary: Array<{ index: number; ok: boolean; durationMs: number; error?: string; jsxBytes?: number; imageCount?: number }> = [];

    for (let i = 1; i <= RUN_COUNT; i++)
    {
        const runDir = path.join(runRoot, `run-${String(i).padStart(2, "0")}`);
        await fs.mkdir(runDir, { recursive: true });
        const tStart = Date.now();

        log(bold(`▶ Run ${i}/${RUN_COUNT}`) + dim(`  [${ts()}]`));

        let runOk = false;
        let runError: string | undefined;
        let jsxBytes = 0;
        let imageCount = 0;
        let sessionId: string | undefined;
        let opCount = 0;

        // ─── Generate (retry RETRY_ATTEMPTS) ─────────────────────────────
        // Each retry is a fresh /v1/chat with no sessionId — server
        // resets the theme and starts clean, so a previous failure
        // doesn't pollute the next attempt.
        let jsx: string | undefined;
        try
        {
            log(dim(`  → /v1/chat …`));
            const chat = await withRetry("generate", () => runGeneration());
            jsx = chat.text || "";
            jsxBytes = jsx.length;
            opCount = chat.ops.length;
            sessionId = chat.sessionId;
            log(green(`  ✓ chat done`) + dim(`  sessionId=${chat.sessionId.slice(0, 8)} jsx=${jsx.length}b ops=${chat.ops.length}`));
            await fs.writeFile(path.join(runDir, "result.jsx"), jsx, "utf-8");
        }
        catch (err)
        {
            runError = `generate failed after ${RETRY_ATTEMPTS} attempts: ${err instanceof Error ? err.message : String(err)}`;
            log(red(`  ✗ skip iteration — ${runError}`));
        }

        // ─── Screenshot (retry RETRY_ATTEMPTS) ───────────────────────────
        // The screenshot endpoint also functions as a sync barrier: the
        // plugin processes ops via executeOpsChain (strictly sequential
        // across batches), so when this returns we KNOW every builder op
        // from the chat step is fully applied. No blind settle sleep
        // needed.
        if (jsx !== undefined && !runError)
        {
            try
            {
                log(dim(`  → /v1/screenshot (also acts as sync barrier) …`));
                const images = await withRetry("screenshot", () => captureScreenshot());
                imageCount = images.length;
                log(green(`  ✓ screenshot`) + dim(`  ${images.length} image(s)`));
                for (let k = 0; k < images.length; k++)
                {
                    const buf = Buffer.from(images[k]!, "base64");
                    const file = path.join(runDir, `page-${k + 1}.png`);
                    await fs.writeFile(file, buf);
                }
                runOk = true;
            }
            catch (err)
            {
                runError = `screenshot failed after ${RETRY_ATTEMPTS} attempts: ${err instanceof Error ? err.message : String(err)}`;
                log(red(`  ✗ skip iteration — ${runError}`));
            }
        }

        await fs.writeFile(path.join(runDir, "meta.json"), JSON.stringify({
            index: i, ok: runOk, durationMs: Date.now() - tStart,
            ...(runError !== undefined ? { error: runError } : {}),
            jsxBytes, imageCount,
            ...(sessionId !== undefined ? { sessionId } : {}),
            opCount,
        }, null, 2), "utf-8");

        summary.push({
            index: i, ok: runOk, durationMs: Date.now() - tStart,
            ...(runError !== undefined ? { error: runError } : {}),
            jsxBytes, imageCount,
        });

        // ─── Wipe + verify-empty (retry RETRY_ATTEMPTS) ──────────────────
        // The verify-empty screenshot is a hard check: plugin reports
        // "no nodes to screenshot" iff the current page is actually
        // clear. If verification fails we retry the wipe — observed in
        // practice that Figma occasionally swallows op application.
        if (!SKIP_WIPE && i < RUN_COUNT)
        {
            try
            {
                log(dim(`  → wipe_design (clear nodes + theme vars + text styles) …`));
                await withRetry("wipe", () => wipeAndVerify());
                log(green(`  ✓ canvas verified empty`));
            }
            catch (err)
            {
                log(yellow(`  ⚠ wipe failed after ${RETRY_ATTEMPTS} attempts: ${err instanceof Error ? err.message : String(err)}`));
                log(yellow(`     continuing — next run may collide with leftover content`));
            }
        }

        // Cooldown before next iteration. Shown as a live countdown so a
        // long pause doesn't look like the script is stuck.
        if (COOLDOWN_MS > 0 && i < RUN_COUNT)
            await sleepWithCountdown(COOLDOWN_MS, "  ⏳ cooldown");

        log("");
    }

    // ─── Summary ─────────────────────────────────────────────────────

    log(dim("─".repeat(60)));
    log(bold("Summary"));
    const successCount = summary.filter((s) => s.ok).length;
    const totalMs = summary.reduce((s, r) => s + r.durationMs, 0);
    const avgMs  = summary.length > 0 ? Math.round(totalMs / summary.length) : 0;
    log(`  ${successCount}/${summary.length} succeeded ${dim(`(avg ${avgMs}ms, total ${Math.round(totalMs / 1000)}s)`)}`);

    for (const r of summary)
    {
        const marker = r.ok ? green("✓") : red("✗");
        const stat = r.ok
            ? dim(`jsx=${r.jsxBytes}b images=${r.imageCount} time=${r.durationMs}ms`)
            : red(`error: ${r.error}`);
        log(`  ${marker} run-${String(r.index).padStart(2, "0")}  ${stat}`);
    }

    await fs.writeFile(path.join(runRoot, "summary.json"), JSON.stringify({
        prompt: PROMPT,
        port: PORT,
        runCount: RUN_COUNT,
        runs: summary,
        successCount,
        totalMs,
        avgMs,
    }, null, 2), "utf-8");
    log("");
    log(dim(`  summary: ${path.join(runRoot, "summary.json")}`));
    log("");
}

await main();
