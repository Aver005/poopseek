import { parse as parseYaml } from "yaml";
import type { ToolCallEnvelope, ToolFlowAction } from "./types";

const TOOL_FLOW_ACTIONS: Record<ToolFlowAction, true> = {
    continue: true,
    stop: true,
    "try-again": true,
    ignore: true,
    "ask-user": true,
};

function isRecord(value: unknown): value is Record<string, unknown>
{
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeAction(
    value: unknown,
    fallback: ToolFlowAction,
): ToolFlowAction
{
    if (typeof value !== "string") return fallback;
    if (!(value in TOOL_FLOW_ACTIONS)) return fallback;
    return value as ToolFlowAction;
}

function toEnvelope(value: unknown): ToolCallEnvelope | null
{
    if (!isRecord(value)) return null;
    if (typeof value.tool !== "string" || value.tool.length === 0) return null;

    const args = isRecord(value.args) ? value.args : {};
    const onError = normalizeAction(value.onError, "continue");
    const onSuccess = normalizeAction(value.onSuccess, "continue");

    return {
        tool: value.tool,
        args,
        onError,
        onSuccess,
    };
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

function extractYamlLikeBlocks(text: string): string[]
{
    const lines = text.split(/\r?\n/);
    const result: string[] = [];

    const getIndent = (line: string): number =>
    {
        const match = line.match(/^\s*/);
        return match?.[0]?.length ?? 0;
    };

    let index = 0;
    while (index < lines.length)
    {
        const startLine = lines[index];
        if (!startLine || !/^\s*tool\s*:/.test(startLine))
        {
            index += 1;
            continue;
        }

        const blockLines: string[] = [startLine];
        index += 1;
        let scalarIndent: number | null = null;

        while (index < lines.length)
        {
            const line = lines[index] ?? "";
            const trimmed = line.trim();
            const indent = getIndent(line);

            if (scalarIndent !== null)
            {
                if (trimmed.length === 0 || indent >= scalarIndent)
                {
                    blockLines.push(line);
                    index += 1;
                    continue;
                }
                scalarIndent = null;
            }

            if (trimmed.length === 0)
            {
                blockLines.push(line);
                index += 1;
                continue;
            }

            if (
                /^\s/.test(line)
                || /^(tool|args|onError|onSuccess)\s*:/.test(trimmed)
            )
            {
                blockLines.push(line);
                if (/^[A-Za-z_][A-Za-z0-9_-]*\s*:\s*[>|][-+0-9]*\s*$/.test(trimmed))
                {
                    scalarIndent = indent + 1;
                }
                index += 1;
                continue;
            }

            break;
        }

        const candidate = blockLines.join("\n").trim();
        if (candidate.length > 0) result.push(candidate);
        if (result.length >= 10) return result;
    }

    return result;
}

function tryParseEnvelope(candidate: string, allowYaml = true): ToolCallEnvelope | null
{
    if (allowYaml)
    {
        try
        {
            const envelope = toEnvelope(parseYaml(candidate, { logLevel: "error" }) as unknown);
            if (envelope) return envelope;
        }
        catch { /* fall through */ }
    }

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
    if (text.trim().length === 0)
    {
        return { toolCalls: [], postText: "" };
    }

    const toolCalls: ToolCallSegment[] = [];
    let lastEnd = 0;

    const fencedRegex = /```(yaml|json)\s*([\s\S]*?)\s*```/gi;

    for (const match of text.matchAll(fencedRegex))
    {
        if (toolCalls.length >= maxTools) break;

        const blockType = match[1]?.toLowerCase();
        const content = match[2]?.trim();
        if (!content) continue;

        const envelope = tryParseEnvelope(content, blockType === "yaml");
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
        const bareYamlResult = extractYamlLikeBlocks(text).reduce<ToolCallEnvelope | null>(
            (found, candidate) => found ?? tryParseEnvelope(candidate, true),
            null,
        );

        if (bareYamlResult)
        {
            return { toolCalls: [{ preText: "", envelope: bareYamlResult }], postText: "" };
        }

        const bareResult = extractJsonLikeBlocks(text).reduce<ToolCallEnvelope | null>(
            (found, candidate) => found ?? tryParseEnvelope(candidate, false),
            null,
        );

        if (bareResult)
        {
            return { toolCalls: [{ preText: "", envelope: bareResult }], postText: "" };
        }
    }

    return { toolCalls, postText };
}
