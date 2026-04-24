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
    const onError = normalizeAction(value.onError, "ask-user");
    const onSuccess = normalizeAction(value.onSuccess, "continue");

    return {
        tool: value.tool,
        args,
        onError,
        onSuccess,
    };
}

function extractFencedJsonBlocks(text: string): string[]
{
    const result: string[] = [];
    const regex = /```json\s*([\s\S]*?)\s*```/gi;

    for (const match of text.matchAll(regex))
    {
        const content = match[1]?.trim();
        if (!content) continue;
        result.push(content);
    }

    return result;
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

function tryParseCandidates(candidates: string[]): ToolCallEnvelope | null
{
    for (const candidate of candidates)
    {
        try
        {
            const parsed = JSON.parse(candidate) as unknown;
            const envelope = toEnvelope(parsed);
            if (!envelope) continue;
            return envelope;
        }
        catch
        {
            const repaired = repairJsonCandidate(candidate);
            if (!repaired) continue;

            try
            {
                const parsed = JSON.parse(repaired) as unknown;
                const envelope = toEnvelope(parsed);
                if (!envelope) continue;
                return envelope;
            }
            catch
            {
                continue;
            }
        }
    }

    return null;
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

export function parseToolCallFromText(text: string): ToolCallEnvelope | null
{
    if (text.trim().length === 0) return null;

    const fencedCandidates = extractFencedJsonBlocks(text);
    const fencedResult = tryParseCandidates(fencedCandidates);
    if (fencedResult) return fencedResult;

    const jsonLikeCandidates = extractJsonLikeBlocks(text);
    return tryParseCandidates(jsonLikeCandidates);
}
