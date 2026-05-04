#!/usr/bin/env bun
/**
 * Preview a JSX layout file directly in Figma without the AI pipeline.
 *
 * Usage:
 *   SOURCE_FILE=assets/raw/layout.jsx bun run scripts/preview.ts
 *   SOURCE_FILE=path/to/layout.jsx bun run scripts/preview.ts --port 7331
 */

import path from "node:path";
import { parseJsx, type JsxNode } from "@/figma/engine/jsx/jsx-parser";
import { compileJsx } from "@/figma/engine/jsx/jsx-compiler";
import { mapKeyToId } from "@/figma/engine/jsx/jsx-key-mapper";

// ─── Config ──────────────────────────────────────────────────────────────────

const PORT = (() =>
{
    const i = process.argv.indexOf("--port");
    return i !== -1 ? Number(process.argv[i + 1]) : 7331;
})();
const BASE_URL = `http://localhost:${PORT}`;

// ─── Helpers ─────────────────────────────────────────────────────────────────

const c = {
    reset: "\x1b[0m",
    dim: "\x1b[2m",
    bold: "\x1b[1m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    red: "\x1b[31m",
    cyan: "\x1b[36m",
    magenta: "\x1b[35m",
    blue: "\x1b[34m",
};

function log(msg: string): void { process.stdout.write(msg + "\n"); }
function dim(s: string): string { return c.dim + s + c.reset; }
function bold(s: string): string { return c.bold + s + c.reset; }
function green(s: string): string { return c.green + s + c.reset; }
function red(s: string): string { return c.red + s + c.reset; }
function yellow(s: string): string { return c.yellow + s + c.reset; }
function cyan(s: string): string { return c.cyan + s + c.reset; }
function magenta(s: string): string { return c.magenta + s + c.reset; }

function printTree(nodes: (JsxNode | string)[], depth = 0): void
{
    for (const node of nodes)
    {
        if (typeof node === "string")
        {
            const text = node.trim();
            if (text) log("  ".repeat(depth) + dim(`"${text.slice(0, 40)}${text.length > 40 ? "…" : ""}"`));
            continue;
        }
        const key = typeof node.props.key === "string" ? node.props.key : "";
        const name = typeof node.props.name === "string" ? ` ${dim(`"${node.props.name}"`)}` : "";
        const cls = typeof node.props.className === "string" ? ` ${dim(node.props.className.split(" ").slice(0, 4).join(" "))}` : "";
        log(
            "  ".repeat(depth)
            + magenta(node.type)
            + (key ? ` ${cyan(key)}` : "")
            + name
            + cls,
        );
        if (node.children.length > 0)
            printTree(node.children, depth + 1);
    }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const sourceFile = process.env["SOURCE_FILE"];
if (!sourceFile)
{
    log(red("✗ SOURCE_FILE is not set"));
    log(dim("  Usage: SOURCE_FILE=path/to/layout.jsx bun run scripts/preview.ts"));
    process.exit(1);
}

const filePath = path.isAbsolute(sourceFile)
    ? sourceFile
    : path.resolve(process.cwd(), sourceFile);

log("");
log(bold("◆ Figma Preview") + dim(` — ${filePath}`));
log(dim("─".repeat(60)));

// ─── Read ─────────────────────────────────────────────────────────────────────

let raw: string;
try
{
    raw = await Bun.file(filePath).text();
}
catch
{
    log(red(`✗ Cannot read file: ${filePath}`));
    process.exit(1);
}

// Extract JSX from fenced block if present
const fenced = raw.match(/```(?:jsx|tsx)?\s*([\s\S]*?)```/);
const jsx = fenced ? fenced[1]!.trim() : raw.trim();

log(`  ${dim("file")}     ${filePath}`);
log(`  ${dim("size")}     ${raw.length} chars`);
log("");

// ─── Parse ────────────────────────────────────────────────────────────────────

let nodes: JsxNode[];
try
{
    nodes = parseJsx(mapKeyToId(jsx));
}
catch (err)
{
    log(red("✗ Parse error"));
    log(red("  " + (err instanceof Error ? err.message : String(err))));
    process.exit(1);
}

const countNodes = (ns: (JsxNode | string)[]): number =>
    ns.reduce<number>((acc, n) => typeof n === "string" ? acc : acc + 1 + countNodes(n.children), 0);

log(bold("Tree") + dim(` (${countNodes(nodes)} nodes)`));
log(dim("─".repeat(60)));
printTree(nodes);
log("");

// ─── Compile ──────────────────────────────────────────────────────────────────

const ops = compileJsx(nodes);
const opTypes = ops.reduce<Record<string, number>>((acc, op) =>
{
    acc[op.type] = (acc[op.type] ?? 0) + 1;
    return acc;
}, {});

log(bold("Ops") + dim(` (${ops.length} total)`));
log(dim("─".repeat(60)));
for (const [type, count] of Object.entries(opTypes))
    log(`  ${cyan(type.padEnd(30))} ${dim("×")} ${yellow(String(count))}`);
log("");

// ─── Server check ─────────────────────────────────────────────────────────────

log(dim(`Checking server at ${BASE_URL} …`));
try
{
    const status = await fetch(`${BASE_URL}/v1/status`);
    if (!status.ok) throw new Error(`HTTP ${status.status}`);
}
catch
{
    log(red(`✗ Figma server not running at port ${PORT}`));
    log(dim("  Start it with: /figma start"));
    log("");
    log(yellow("✎ Saving ops to preview-ops.json for inspection …"));
    await Bun.write("preview-ops.json", JSON.stringify(ops, null, 2));
    log(dim("  Written: preview-ops.json"));
    process.exit(1);
}

// ─── Send ─────────────────────────────────────────────────────────────────────

log(dim("Sending ops to Figma …"));
const res = await fetch(`${BASE_URL}/v1/ops`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ops }),
});

if (!res.ok)
{
    log(red(`✗ Server returned ${res.status}`));
    process.exit(1);
}

log(green(`✓ Sent ${ops.length} ops to Figma`));
log(dim("  Plugin will apply them on the next poll cycle (~1s)"));
log("");
