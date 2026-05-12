#!/usr/bin/env bun
/**
 * Run N sequential generations of one hard-coded prompt against the
 * running Figma server, saving the produced JSX + a full-page PNG
 * export after each, then wiping the canvas before the next iteration.
 *
 * For multi-prompt overnight runs use `scripts/bench/run.ts` instead —
 * that one reads a config JSON and rotates through different prompts.
 *
 * Usage:
 *   1. Start the Figma server + open the plugin in Figma:
 *        bun start --figma
 *   2. Run this script:
 *        bun run scripts/bench.ts
 *   3. Results land in `bench-runs/<ISO timestamp>/run-NN/{result.jsx,page-M.png,meta.json}`.
 *
 * Knobs (top of file):
 *   PROMPT           — the prompt every iteration sends
 *   RUN_COUNT        — number of iterations
 *
 * CLI flags:
 *   --port <n>       — server port (default 7331)
 *   --no-wipe        — skip the wipe between iterations
 *   --cooldown <t>   — pause between iterations ("30", "30s", "2m", "1500ms")
 *
 * Architecture: this script talks ONLY to the HTTP server. The Figma
 * plugin handles screenshot export and wipe via existing op handlers
 * (request_screenshot, wipe_design). Sequential ops are guaranteed in
 * order by the plugin's executeOpsChain, so the screenshot endpoint
 * itself acts as the sync barrier — no blind `sleep` anywhere.
 */

import fs from "node:fs/promises";
import path from "node:path";
import {
    log, dim, bold, green, red, cyan, magenta,
    formatDuration, sleepWithCountdown,
    checkServer, pingPluginScreenshot,
    runIteration,
    type IterationOutcome,
} from "./bench/lib";

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
const COOLDOWN_MS_DEFAULT = 100;

// ─── CLI args ────────────────────────────────────────────────────────

function argValue(flag: string): string | undefined
{
    const i = process.argv.indexOf(flag);
    return i !== -1 ? process.argv[i + 1] : undefined;
}

const PORT = Number(argValue("--port") ?? 7331);
const SKIP_WIPE = process.argv.includes("--no-wipe");

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

// ─── Main ────────────────────────────────────────────────────────────

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

    await checkServer(BASE_URL);
    await pingPluginScreenshot(BASE_URL);

    const startedAt = new Date().toISOString().replace(/[:.]/g, "-");
    const runRoot = path.resolve(process.cwd(), "bench-runs", startedAt);
    await fs.mkdir(runRoot, { recursive: true });
    log(dim(`  output dir: ${runRoot}`));
    log("");

    const summary: IterationOutcome[] = [];

    for (let i = 1; i <= RUN_COUNT; i++)
    {
        const runDir = path.join(runRoot, `run-${String(i).padStart(2, "0")}`);
        const outcome = await runIteration({
            baseUrl: BASE_URL,
            prompt: PROMPT,
            runDir,
            index: i,
            total: RUN_COUNT,
            skipWipe: SKIP_WIPE,
            isLast: i === RUN_COUNT,
        });
        summary.push(outcome);

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
    log(`  ${successCount}/${summary.length} succeeded ${dim(`(avg ${formatDuration(avgMs)}, total ${formatDuration(totalMs)})`)}`);

    for (const r of summary)
    {
        const marker = r.ok ? green("✓") : red("✗");
        const stat = r.ok
            ? dim(`jsx=${r.jsxBytes}b images=${r.imageCount} time=${formatDuration(r.durationMs)}`)
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
