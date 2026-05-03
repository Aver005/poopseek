import type { ToolCallAttachment, ToolCallEnvelope } from "./types";

const TOOL_FENCE_LANGUAGES = new Set(["", "json", "javascript", "js", "typescript", "ts"]);
const JSX_FENCE_LANGUAGES = new Set(["jsx", "tsx"]);
const FENCED_BLOCK_REGEX = /```([A-Za-z0-9_-]*)\s*\r?\n?([\s\S]*?)\s*```/g;

function isRecord(value: unknown): value is Record<string, unknown>
{
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toEnvelope(value: unknown): ToolCallEnvelope | null
{
    if (!isRecord(value)) return null;
    if (typeof value.tool !== "string" || value.tool.length === 0) return null;

    const args = isRecord(value.args) ? value.args : {};

    return { tool: value.tool, args };
}

function hasLegacyInlineJsxArgs(envelope: ToolCallEnvelope): boolean
{
    if (envelope.tool === "figma.primitives.jsx") return false;

    if (typeof envelope.args.jsx === "string" && envelope.args.jsx.trim().length > 0)
        return true;
    return false;
}

export function toolSupportsJsxAttachments(toolName: string): boolean
{
    return toolName === "figma.primitives.jsx"
        || toolName === "figma.compile"
        || toolName === "figma_compile"
        || toolName === "figma_render";
}

export function toolNeedsJsxAttachments(envelope: ToolCallEnvelope): boolean
{
    return toolSupportsJsxAttachments(envelope.tool) && !hasLegacyInlineJsxArgs(envelope);
}

function attachToolBlocks(envelope: ToolCallEnvelope, attachments: ToolCallAttachment[]): ToolCallEnvelope
{
    if (attachments.length === 0) return envelope;
    return {
        ...envelope,
        attachments,
    };
}

export function stripLeadingLanguageTag(content: string): string
{
    const newline = content.indexOf("\n");
    if (newline === -1) return content;
    const firstLine = content.slice(0, newline).trim();
    if (firstLine.length > 0 && /^[A-Za-z0-9_-]+$/.test(firstLine))
    {
        return content.slice(newline + 1).trim();
    }
    return content;
}

function extractAttachmentLabel(text: string): string | undefined
{
    const lines = text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);

    const candidate = lines.at(-1);
    if (!candidate) return undefined;

    const normalized = candidate
        .replace(/^[-*]\s*/, "")
        .replace(/^`(.+)`$/, "$1")
        .replace(/:$/, "")
        .trim();

    return normalized.length > 0 ? normalized : undefined;
}

function extractJsonLikeBlocks(text: string): string[]
{
    const result: string[] = [];
    let depth = 0;
    let startIndex = -1;
    let inString = false;
    let escaped = false;

    for (let index = 0; index < text.length; index += 1)
    {
        const char = text[index];
        if (!char) continue;

        if (inString)
        {
            if (escaped)
            {
                escaped = false;
                continue;
            }

            if (char === "\\")
            {
                escaped = true;
                continue;
            }

            if (char === "\"")
            {
                inString = false;
            }

            continue;
        }

        if (char === "\"")
        {
            inString = true;
            continue;
        }

        if (char === "{")
        {
            if (depth === 0) startIndex = index;
            depth += 1;
            continue;
        }

        if (char !== "}") continue;
        if (depth === 0) continue;

        depth -= 1;
        if (depth !== 0 || startIndex === -1) continue;

        const block = text.slice(startIndex, index + 1).trim();
        if (block.length > 0) result.push(block);
        if (result.length >= 10) return result;
    }

    return result;
}

export function tryParseEnvelope(candidate: string): ToolCallEnvelope | null
{
    const normalized = normalizeToolCandidate(candidate);

    try
    {
        const envelope = toEnvelope(JSON.parse(normalized) as unknown);
        if (envelope) return envelope;
    }
    catch { /* fall through */ }

    const repaired = repairJsonCandidate(normalized);
    if (!repaired) return null;

    try
    {
        return toEnvelope(JSON.parse(repaired) as unknown);
    }
    catch
    {
        return null;
    }
}

function findToolAnchoredCandidate(text: string): string | null
{
    const toolMatch = /["']tool["']\s*:/.exec(text);
    if (!toolMatch) return null;

    const anchor = toolMatch.index ?? -1;
    if (anchor === -1) return null;

    let start = anchor;
    while (start >= 0 && text[start] !== "{") start -= 1;
    if (start < 0) return null;

    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let index = start; index < text.length; index += 1)
    {
        const char = text[index]!;

        if (inString)
        {
            if (escaped)
            {
                escaped = false;
                continue;
            }

            if (char === "\\")
            {
                escaped = true;
                continue;
            }

            if (char === "\"")
            {
                inString = false;
            }

            continue;
        }

        if (char === "\"")
        {
            inString = true;
            continue;
        }

        if (char === "{")
        {
            depth += 1;
            continue;
        }

        if (char !== "}") continue;
        if (depth === 0) continue;

        depth -= 1;
        if (depth === 0)
        {
            return text.slice(start, index + 1).trim();
        }
    }

    return text.slice(start).trim();
}

// ── Public export for streaming parser ───────────────────────────────────────

export { extractJsonLikeBlocks };

function repairLiteralControlChars(input: string): string
{
    let result = "";
    let inString = false;
    let escaped = false;

    for (let i = 0; i < input.length; i += 1)
    {
        const c = input[i]!;

        if (escaped)
        {
            escaped = false;
            result += c;
            continue;
        }

        if (c === "\\" && inString)
        {
            escaped = true;
            result += c;
            continue;
        }

        if (c === '"')
        {
            inString = !inString;
            result += c;
            continue;
        }

        if (inString)
        {
            if (c === "\n") { result += "\\n"; continue; }
            if (c === "\r") { result += "\\r"; continue; }
            if (c === "\t") { result += "\\t"; continue; }
        }

        result += c;
    }

    return result;
}

function repairJsonCandidate(input: string): string | null
{
    const trimmed = input.trim();
    if (trimmed.length === 0) return null;

    let repaired = repairLiteralControlChars(trimmed);

    for (let pass = 0; pass < 3; pass += 1)
    {
        const next = repaired.replace(/,\s*([}\]])/g, "$1");
        if (next === repaired) break;
        repaired = next;
    }

    return repaired;
}

function normalizeToolCandidate(input: string): string
{
    const trimmed = input.trim();
    const strippedFence = trimmed
        .replace(/^```(?:json|javascript|js|typescript|ts)?\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();

    const languageLineMatch = /^(json|javascript|js|typescript|ts)\s*\r?\n([\s\S]+)$/i.exec(strippedFence);
    return languageLineMatch?.[2]?.trim() ?? strippedFence;
}

// ── Public types ─────────────────────────────────────────────────────────────

export interface ToolCallSegment
{
    preText: string;
    envelope: ToolCallEnvelope;
}

export interface ParsedAgentMessage
{
    toolCalls: ToolCallSegment[];
    postText: string;
}

// ── Main export ───────────────────────────────────────────────────────────────

export function parseMessage(text: string, maxTools = 10): ParsedAgentMessage
{
    if (text.trim().length === 0) return { toolCalls: [], postText: "" };
    const toolCalls: ToolCallSegment[] = [];
    let lastEnd = 0;
    let current:
        | {
            toolStart: number;
            spanEnd: number;
            envelope: ToolCallEnvelope;
            attachments: ToolCallAttachment[];
        }
        | null = null;

    const finalizeCurrent = (): void =>
    {
        if (!current || toolCalls.length >= maxTools) return;
        if (toolNeedsJsxAttachments(current.envelope) && current.attachments.length === 0)
        {
            current = null;
            return;
        }

        const preText = text.slice(lastEnd, current.toolStart).trim();
        toolCalls.push({
            preText,
            envelope: attachToolBlocks(current.envelope, current.attachments),
        });
        lastEnd = current.spanEnd;
        current = null;
    };

    for (const match of text.matchAll(FENCED_BLOCK_REGEX))
    {
        if (toolCalls.length >= maxTools) break;

        const language = match[1]?.trim().toLowerCase() ?? "";
        const content = match[2]?.trim();
        const start = match.index ?? 0;
        const end = start + match[0].length;

        if (!content) continue;

        if (TOOL_FENCE_LANGUAGES.has(language))
        {
            const envelope = tryParseEnvelope(content);
            if (envelope)
            {
                finalizeCurrent();
                current = {
                    toolStart: start,
                    spanEnd: end,
                    envelope,
                    attachments: [],
                };
                continue;
            }
        }

        if (
            current
            && JSX_FENCE_LANGUAGES.has(language)
            && toolSupportsJsxAttachments(current.envelope.tool)
        )
        {
            const rawJsx = stripLeadingLanguageTag(content).trim();
            if (rawJsx.length === 0) continue;

            const labelText = text.slice(current.spanEnd, start).trim();
            current.attachments.push({
                kind: "jsx",
                content: rawJsx,
                label: extractAttachmentLabel(labelText),
            });
            current.spanEnd = end;
        }
    }

    finalizeCurrent();

    const postText = text.slice(lastEnd).trim();

    // Fallback: no fenced tool blocks found → try bare JSON (single tool, no preText)
    if (toolCalls.length === 0)
    {
        const bareResult = extractJsonLikeBlocks(text).reduce<ToolCallEnvelope | null>(
            (found, candidate) => found ?? tryParseEnvelope(candidate),
            null,
        );

        if (bareResult)
        {
            if (toolNeedsJsxAttachments(bareResult))
                return { toolCalls: [], postText: "" };
            return { toolCalls: [{ preText: "", envelope: bareResult }], postText: "" };
        }

        const anchoredCandidate = findToolAnchoredCandidate(text);
        const anchoredResult = anchoredCandidate ? tryParseEnvelope(anchoredCandidate) : null;
        if (anchoredResult)
        {
            if (toolNeedsJsxAttachments(anchoredResult))
                return { toolCalls: [], postText: "" };
            return { toolCalls: [{ preText: "", envelope: anchoredResult }], postText: "" };
        }
    }

    return { toolCalls, postText };
}
