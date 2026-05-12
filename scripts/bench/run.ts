#!/usr/bin/env bun
/**
 * Overnight bench runner — drives N×M generations across several
 * prompts read from a config JSON.
 *
 * Usage:
 *   1. Edit `scripts/bench/settings.json` (path is the SETTINGS_PATH
 *      constant below). Add one entry per prompt:
 *
 *      {
 *        "runs": [
 *          { "name": "pizza-app",
 *            "promptPath": "assets/bench-runs/pizza-app/prompt.md",
 *            "outputPath": "assets/bench-runs/pizza-app",
 *            "count": 50,
 *            "cooldown": 1500 }
 *        ]
 *      }
 *
 *      - promptPath  — file with the prompt text (any text format)
 *      - outputPath  — where this prompt's outputs go; each script run
 *                      writes a timestamped subdir there with run-NN/
 *      - count       — iterations for this prompt
 *      - cooldown    — milliseconds between iterations within the prompt
 *
 *   2. Start Figma server + plugin:
 *        bun start --figma
 *
 *   3. Run it:
 *        bun run scripts/bench/run.ts
 *      Then go to sleep. Wake up to a folder of designs.
 *
 * Robustness: each iteration retries generate/screenshot/wipe up to 3
 * times. After 3 failed attempts the iteration is marked failed in
 * meta.json, the canvas is wiped, and the next iteration starts —
 * no manual intervention required.
 */

import fs from "node:fs/promises";
import path from "node:path";
import {
    log, dim, bold, green, red, yellow, cyan, magenta,
    formatDuration, sleepWithCountdown,
    checkServer, pingPluginScreenshot,
    runIteration, wipeAndVerify, withRetry,
    type IterationOutcome,
} from "./lib";

// ─── Where settings live (the only constant you usually touch) ──────

const SETTINGS_PATH = "scripts/bench/settings.json";

// ─── CLI ────────────────────────────────────────────────────────────

function argValue(flag: string): string | undefined
{
    const i = process.argv.indexOf(flag);
    return i !== -1 ? process.argv[i + 1] : undefined;
}

const PORT = Number(argValue("--port") ?? 7331);
const BASE_URL = `http://localhost:${PORT}`;
const SKIP_WIPE = process.argv.includes("--no-wipe");

// ─── Settings shape ──────────────────────────────────────────────────

interface RunConfig
{
    name: string;
    promptPath: string;
    outputPath: string;
    count: number;
    /** Milliseconds between iterations within this prompt. */
    cooldown?: number;
}

interface Settings
{
    runs: RunConfig[];
}

async function readSettings(): Promise<Settings>
{
    const absPath = path.resolve(process.cwd(), SETTINGS_PATH);
    let raw: string;
    try { raw = await fs.readFile(absPath, "utf-8"); }
    catch (err)
    {
        log(red(`✗ cannot read settings: ${absPath}`));
        log(dim(`  ${err instanceof Error ? err.message : String(err)}`));
        process.exit(1);
    }

    let parsed: unknown;
    try { parsed = JSON.parse(raw); }
    catch (err)
    {
        log(red(`✗ settings is not valid JSON: ${absPath}`));
        log(dim(`  ${err instanceof Error ? err.message : String(err)}`));
        process.exit(1);
    }

    const obj = parsed as Settings;
    if (!Array.isArray(obj?.runs) || obj.runs.length === 0)
    {
        log(red(`✗ settings.runs must be a non-empty array`));
        process.exit(1);
    }

    for (let i = 0; i < obj.runs.length; i++)
    {
        const r = obj.runs[i]!;
        const ctx = `runs[${i}]${r.name ? ` (${r.name})` : ""}`;
        if (!r.name)        { log(red(`✗ ${ctx}: missing "name"`)); process.exit(1); }
        if (!r.promptPath)  { log(red(`✗ ${ctx}: missing "promptPath"`)); process.exit(1); }
        if (!r.outputPath)  { log(red(`✗ ${ctx}: missing "outputPath"`)); process.exit(1); }
        if (typeof r.count !== "number" || r.count < 1)
        {
            log(red(`✗ ${ctx}: "count" must be a positive number`));
            process.exit(1);
        }
    }

    return obj;
}

async function readPrompt(promptPath: string, name: string): Promise<string>
{
    const abs = path.resolve(process.cwd(), promptPath);
    try
    {
        const raw = await fs.readFile(abs, "utf-8");
        const trimmed = raw.trim();
        if (!trimmed) throw new Error("prompt file is empty");
        return trimmed;
    }
    catch (err)
    {
        throw new Error(`run "${name}": cannot read prompt at ${abs} — ${err instanceof Error ? err.message : String(err)}`);
    }
}

// ─── ETA helper ──────────────────────────────────────────────────────

function estimateEta(completedDurations: number[], remainingIterations: number): string
{
    if (completedDurations.length === 0 || remainingIterations === 0) return "?";
    // Use the median to dampen the long-tail effect of one slow run.
    const sorted = [...completedDurations].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)]!;
    return formatDuration(median * remainingIterations);
}

// ─── Main ────────────────────────────────────────────────────────────

interface RunSummary
{
    name: string;
    promptPath: string;
    outputPath: string;
    timestampDir: string;
    count: number;
    successCount: number;
    totalMs: number;
    iterations: IterationOutcome[];
}

async function main(): Promise<void>
{
    const settings = await readSettings();
    const totalIterations = settings.runs.reduce((s, r) => s + r.count, 0);

    log("");
    log(bold(magenta("◆ PoopSeek bench (config-driven)"))
        + dim(`  ${settings.runs.length} prompt(s), ${totalIterations} iteration(s) total`)
        + dim(`  @ ${BASE_URL}`)
        + (SKIP_WIPE ? dim(`  · --no-wipe`) : ""));
    log(dim("─".repeat(72)));
    log(dim(`  settings: ${path.resolve(process.cwd(), SETTINGS_PATH)}`));
    for (const r of settings.runs)
    {
        const cd = r.cooldown ? `, cooldown=${formatDuration(r.cooldown)}` : "";
        log(dim(`    • ${r.name.padEnd(20)}  count=${r.count}${cd}  → ${r.outputPath}`));
    }
    log("");

    await checkServer(BASE_URL);
    await pingPluginScreenshot(BASE_URL);
    log("");

    // One wipe upfront — start each session on an empty canvas. If
    // there's leftover content from a previous bench, the first
    // iteration would dispatch its design alongside it.
    try
    {
        log(dim(`  → upfront wipe (clean slate) …`));
        await withRetry("upfront-wipe", () => wipeAndVerify(BASE_URL));
        log(green(`  ✓ canvas verified empty`));
    }
    catch (err)
    {
        log(yellow(`  ⚠ upfront wipe failed: ${err instanceof Error ? err.message : String(err)}`));
        log(yellow(`    starting anyway — first iteration may collide with leftovers`));
    }
    log("");

    const overallStartedAt = new Date().toISOString().replace(/[:.]/g, "-");
    const sessionStart = Date.now();
    const overallSummaries: RunSummary[] = [];
    const allDurations: number[] = [];

    let globalDone = 0;
    for (let r = 0; r < settings.runs.length; r++)
    {
        const cfg = settings.runs[r]!;
        log(dim("━".repeat(72)));
        log(bold(cyan(`■ Prompt ${r + 1}/${settings.runs.length}: "${cfg.name}"`))
            + dim(`  ${cfg.count} iteration(s)`));

        let prompt: string;
        try { prompt = await readPrompt(cfg.promptPath, cfg.name); }
        catch (err)
        {
            log(red(`✗ ${err instanceof Error ? err.message : String(err)}`));
            log(yellow(`  skipping this prompt`));
            overallSummaries.push({
                name: cfg.name, promptPath: cfg.promptPath, outputPath: cfg.outputPath,
                timestampDir: "(not created)", count: cfg.count,
                successCount: 0, totalMs: 0, iterations: [],
            });
            continue;
        }

        log(dim(`  prompt:`));
        log(dim(prompt.split("\n").slice(0, 3).map((l) => "    " + l).join("\n")));
        log(dim(`    …(${prompt.length} chars total)`));

        const promptOutRoot = path.resolve(process.cwd(), cfg.outputPath);
        const tsDir = path.join(promptOutRoot, overallStartedAt);
        await fs.mkdir(tsDir, { recursive: true });
        log(dim(`  output → ${tsDir}`));
        log("");

        const iterations: IterationOutcome[] = [];
        const runStart = Date.now();

        for (let i = 1; i <= cfg.count; i++)
        {
            globalDone++;
            const remaining = totalIterations - globalDone + 1;
            const eta = estimateEta(allDurations, remaining - 1);
            const headerLabel = `${cfg.name}  (overall ${globalDone}/${totalIterations}, ETA ${eta})`;

            const runDir = path.join(tsDir, `run-${String(i).padStart(2, "0")}`);
            const outcome = await runIteration({
                baseUrl: BASE_URL,
                prompt,
                runDir,
                index: i,
                total: cfg.count,
                skipWipe: SKIP_WIPE,
                isLast: i === cfg.count,
                header: headerLabel,
            });
            iterations.push(outcome);
            allDurations.push(outcome.durationMs);

            if ((cfg.cooldown ?? 0) > 0 && i < cfg.count)
                await sleepWithCountdown(cfg.cooldown!, "  ⏳ cooldown");

            log("");
        }

        const totalMs = Date.now() - runStart;
        const successCount = iterations.filter((it) => it.ok).length;
        const summary: RunSummary = {
            name: cfg.name,
            promptPath: cfg.promptPath,
            outputPath: cfg.outputPath,
            timestampDir: tsDir,
            count: cfg.count,
            successCount,
            totalMs,
            iterations,
        };
        overallSummaries.push(summary);

        await fs.writeFile(path.join(tsDir, "summary.json"), JSON.stringify({
            name: cfg.name,
            prompt,
            promptPath: cfg.promptPath,
            cooldown: cfg.cooldown ?? 0,
            count: cfg.count,
            successCount,
            totalMs,
            avgMs: cfg.count > 0 ? Math.round(totalMs / cfg.count) : 0,
            runs: iterations,
        }, null, 2), "utf-8");

        log(dim(`  prompt "${cfg.name}" done: ${successCount}/${cfg.count} ok, ${formatDuration(totalMs)}`));
        log("");

        // Between-prompt wipe — ensures the next prompt's first
        // iteration starts on a clean canvas. The last iteration's
        // `isLast: true` already skipped its wipe.
        if (!SKIP_WIPE && r < settings.runs.length - 1)
        {
            try
            {
                log(dim(`  → between-prompt wipe …`));
                await withRetry("between-wipe", () => wipeAndVerify(BASE_URL));
                log(green(`  ✓ canvas verified empty`));
            }
            catch (err)
            {
                log(yellow(`  ⚠ between-prompt wipe failed: ${err instanceof Error ? err.message : String(err)}`));
            }
            log("");
        }
    }

    // ─── Overall summary ─────────────────────────────────────────────

    const totalMs = Date.now() - sessionStart;
    const totalSuccess = overallSummaries.reduce((s, r) => s + r.successCount, 0);
    const totalAttempted = overallSummaries.reduce((s, r) => s + r.iterations.length, 0);

    log(dim("━".repeat(72)));
    log(bold(magenta(`◆ Done`)) + dim(`  ${totalSuccess}/${totalAttempted} succeeded, ${formatDuration(totalMs)} wall-clock`));
    log("");
    for (const s of overallSummaries)
    {
        const marker = s.successCount === s.count ? green("✓") : (s.successCount > 0 ? yellow("◐") : red("✗"));
        log(`  ${marker} ${s.name.padEnd(20)}  ${s.successCount}/${s.count}  ${dim(formatDuration(s.totalMs))}  ${dim(s.timestampDir)}`);
    }

    // One combined summary at the SETTINGS_PATH directory for easy
    // overnight-retrospective.
    const settingsDir = path.dirname(path.resolve(process.cwd(), SETTINGS_PATH));
    const overallFile = path.join(settingsDir, `summary-${overallStartedAt}.json`);
    await fs.writeFile(overallFile, JSON.stringify({
        startedAt: overallStartedAt,
        totalMs,
        totalAttempted,
        totalSuccess,
        port: PORT,
        skipWipe: SKIP_WIPE,
        prompts: overallSummaries,
    }, null, 2), "utf-8");
    log("");
    log(dim(`  combined summary: ${overallFile}`));
    log("");
}

await main();
