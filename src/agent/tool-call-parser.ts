import type { ToolCallEnvelope } from "./types";

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

function tryParseEnvelope(candidate: string): ToolCallEnvelope | null
{
    try
    {
        const envelope = toEnvelope(JSON.parse(candidate) as unknown);
        if (envelope) return envelope;
    }
    catch { /* fall through */ }

    const repaired = repairJsonCandidate(candidate);
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

function repairJsonCandidate(input: string): string | null
{
    const trimmed = input.trim();
    if (trimmed.length === 0) return null;

    let repaired = trimmed;
    for (let pass = 0; pass < 3; pass += 1)
    {
        const next = repaired.replace(/,\s*([}\]])/g, "$1");
        if (next === repaired) break;
        repaired = next;
    }

    return repaired;
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

    const fencedRegex = /```([A-Za-z0-9_-]*)\s*\r?\n?([\s\S]*?)\s*```/g;

    for (const match of text.matchAll(fencedRegex))
    {
        if (toolCalls.length >= maxTools) break;

        const language = match[1]?.trim().toLowerCase() ?? "";
        if (language === "yaml" || language === "yml") continue;

        const content = match[2]?.trim();
        if (!content) continue;

        const envelope = tryParseEnvelope(content);
        if (!envelope) continue;

        const start = match.index ?? 0;
        const preText = text.slice(lastEnd, start).trim();

        toolCalls.push({ preText, envelope });
        lastEnd = start + match[0].length;
    }

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
            return { toolCalls: [{ preText: "", envelope: bareResult }], postText: "" };
        }
    }

    return { toolCalls, postText };
}
