// Verbose plugin debug logging.
//
// Set DEBUG=false here to silence all dlog() calls. derr() always fires.
// All logs are tagged so you can grep them in Figma's plugin console.
//
// Tags in use:
//   [ops/N/M]            — per-op lifecycle (start/done/error)
//   [resolveParent]      — parent-id resolution path
//   [resolveNode]        — node-id resolution path
//   [applyLayoutSizing]  — fillParent / fillParentHeight application
//   [create_frame]       — create_frame decision path (reuse / find / new)
//   [create_text]        — same for text
//   [create_rect]        — same for rect
//   [create_ellipse]     — same for ellipse
//   [create_image]       — same for image
//   [create_line]        — same for line
//   [set_auto_layout]    — direction + sizing decisions
//   [clear_frame_children] — frame lookup, removal count, stale prune

export const DEBUG = true;

// Tracks the currently-executing op so all logs inside its handler get the
// same `[ops/N/M]` prefix. Set by registry.executeOps before each handler.
let currentOpTag: string | null = null;

export function setCurrentOpTag(tag: string | null): void
{
    currentOpTag = tag;
}

function prefix(tag: string): string
{
    return currentOpTag ? `[${currentOpTag}][${tag}]` : `[${tag}]`;
}

// In-memory buffer mirroring everything we wrote via dlog/derr in the
// current batch. Drained by handlers.ts after EXECUTE_OPS and posted to
// the plugin chat as a single copyable card — way easier to share than
// scrolling the figma plugin console.
const LOG_BUFFER_LIMIT = 10000;
const logBuffer: string[] = [];

function bufferLine(level: "log" | "err", line: string): void
{
    if (logBuffer.length >= LOG_BUFFER_LIMIT) logBuffer.shift();
    const stamp = level === "err" ? "ERR " : "    ";
    logBuffer.push(`${stamp}${line}`);
}

function fmtArgs(args: unknown[]): string
{
    return args
        .map((a) =>
        {
            if (typeof a === "string") return a;
            if (a instanceof Error) return `${a.message}\n${a.stack ?? ""}`;
            try { return JSON.stringify(a); } catch { return String(a); }
        })
        .join(" ");
}

export function dlog(tag: string, ...args: unknown[]): void
{
    if (!DEBUG) return;
    const pfx = prefix(tag);
    console.log(pfx, ...args);
    bufferLine("log", `${pfx} ${fmtArgs(args)}`);
}

export function derr(tag: string, ...args: unknown[]): void
{
    const pfx = prefix(tag);
    console.error(pfx, ...args);
    bufferLine("err", `${pfx} ${fmtArgs(args)}`);
}

export function drainLogBuffer(): string[]
{
    const out = logBuffer.slice();
    logBuffer.length = 0;
    return out;
}

export function logBufferSize(): number
{
    return logBuffer.length;
}

type AnyNode = BaseNode & {
    type: string;
    id: string;
    name?: string;
    parent?: BaseNode | null;
    layoutMode?: "NONE" | "HORIZONTAL" | "VERTICAL";
    layoutSizingHorizontal?: "FIXED" | "HUG" | "FILL";
    layoutSizingVertical?: "FIXED" | "HUG" | "FILL";
    width?: number;
    height?: number;
    removed?: boolean;
};

export function describeNode(node: BaseNode | null | undefined): string
{
    if (!node) return "null";
    const n = node as AnyNode;
    const parts: string[] = [];
    parts.push(`${n.type}#${n.id}`);
    if (typeof n.name === "string") parts.push(`name="${n.name}"`);
    if ("layoutMode" in n) parts.push(`layoutMode=${n.layoutMode}`);
    if ("layoutSizingHorizontal" in n) parts.push(`lsH=${n.layoutSizingHorizontal}`);
    if ("layoutSizingVertical" in n) parts.push(`lsV=${n.layoutSizingVertical}`);
    if ("width" in n && "height" in n) parts.push(`size=${n.width}x${n.height}`);
    if (n.removed) parts.push("REMOVED");
    if ("parent" in n)
    {
        const p = n.parent as AnyNode | null | undefined;
        if (p)
        {
            const pLayout = "layoutMode" in p ? p.layoutMode : "n/a";
            parts.push(`parent=${p.type}#${p.id}/"${p.name ?? "?"}"/layoutMode=${pLayout}`);
        }
        else
        {
            parts.push("parent=null");
        }
    }
    return parts.join(" ");
}

export function describeOp(op: Record<string, unknown>): string
{
    const t = String(op.type ?? "?");
    const id = op.id ?? op.nodeId ?? "";
    const frameId = op.frameId ?? "";
    const extra: string[] = [];
    if (op.fillParent) extra.push("fillParent");
    if (op.fillParentHeight) extra.push("fillParentHeight");
    if (op.hugMain) extra.push("hugMain");
    if (op.hugCross) extra.push("hugCross");
    if (op.direction) extra.push(`dir=${op.direction}`);
    if (op.width !== undefined) extra.push(`w=${op.width}`);
    if (op.height !== undefined) extra.push(`h=${op.height}`);
    return `${t} id=${id} frameId=${frameId}${extra.length ? " " + extra.join(",") : ""}`;
}
