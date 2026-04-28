export interface CollectDeepseekOutputOptions
{
    onTextChunk?: (chunk: string) => void;
    signal?: AbortSignal;
}

export interface CollectedDeepseekOutput
{
    text: string;
    parentMessageId: number | null;
}

function isRecord(value: unknown): value is Record<string, unknown>
{
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getValueByPath(
    value: unknown,
    path: Array<string | number>,
): unknown
{
    let current: unknown = value;

    for (const segment of path)
    {
        if (typeof segment === "number")
        {
            if (!Array.isArray(current)) return null;
            current = current[segment];
            continue;
        }

        if (!isRecord(current)) return null;
        current = current[segment];
    }

    return current;
}

function toText(value: unknown): string
{
    if (typeof value === "string") return value;
    if (typeof value === "number" && Number.isFinite(value)) return String(value);

    if (Array.isArray(value))
    {
        const chunks = value.map((item) => toText(item)).filter((item) => item.length > 0);
        return chunks.join("");
    }

    if (isRecord(value))
    {
        const fromText = toText(value.text);
        if (fromText.length > 0) return fromText;
        const fromContent = toText(value.content);
        if (fromContent.length > 0) return fromContent;
    }

    return "";
}

function extractResponseFragmentsContent(responseNode: unknown): string
{
    if (!isRecord(responseNode)) return "";
    const fragments = responseNode.fragments;
    if (!Array.isArray(fragments) || fragments.length === 0) return "";

    const parts: string[] = [];
    for (const fragment of fragments)
    {
        if (!isRecord(fragment)) continue;
        const content = fragment.content;
        if (typeof content !== "string" || content.length === 0) continue;
        parts.push(content);
    }

    return parts.join("");
}

function extractTextFromEvent(event: unknown): string
{
    if (isRecord(event))
    {
        const eventV = event.v;
        const patchPath = typeof event.p === "string" ? event.p : null;
        const operation = typeof event.o === "string" ? event.o : null;
        if (typeof eventV === "string")
        {
            if (eventV === "FINISHED") return "";
            if (patchPath && !patchPath.includes("/content")) return "";
            if (operation && operation !== "APPEND" && operation !== "SET") return "";
            return eventV;
        }

        if (isRecord(eventV))
        {
            const fromResponse = extractResponseFragmentsContent(eventV.response);
            if (fromResponse.length > 0) return fromResponse;
        }
    }

    const paths: Array<Array<string | number>> = [
        ["choices", 0, "delta", "content"],
        ["choices", 0, "delta", "reasoning_content"],
        ["choices", 0, "message", "content"],
        ["choices", 0, "text"],
        ["data", "choices", 0, "delta", "content"],
        ["data", "choices", 0, "message", "content"],
        ["data", "message", "content"],
        ["delta", "content"],
        ["message", "content"],
    ];

    for (const path of paths)
    {
        const value = getValueByPath(event, path);
        const text = toText(value);
        if (text.length === 0) continue;
        return text;
    }

    return "";
}

function normalizeEventPayload(payload: unknown): unknown
{
    let current = payload;

    for (let index = 0; index < 3; index += 1)
    {
        if (typeof current !== "string") return current;
        const trimmed = current.trim();
        if (trimmed.length === 0) return "";

        const mayBeJson =
            (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
            (trimmed.startsWith("[") && trimmed.endsWith("]")) ||
            (trimmed.startsWith("\"") && trimmed.endsWith("\""));
        if (!mayBeJson) return trimmed;

        try
        {
            current = JSON.parse(trimmed) as unknown;
        }
        catch
        {
            return trimmed;
        }
    }

    return current;
}

function extractParentMessageId(event: unknown): number | null
{
    const paths: Array<Array<string | number>> = [
        ["response_message_id"],
        ["parent_message_id"],
        ["message_id"],
        ["id"],
        ["v", "response", "message_id"],
        ["v", "response", "parent_id"],
        ["data", "parent_message_id"],
        ["data", "message_id"],
        ["choices", 0, "message", "id"],
        ["choices", 0, "message_id"],
    ];

    for (const path of paths)
    {
        const value = getValueByPath(event, path);
        if (typeof value === "number" && Number.isFinite(value)) return value;
        if (typeof value === "string")
        {
            const parsed = Number(value);
            if (Number.isFinite(parsed)) return parsed;
        }
    }

    return null;
}

export async function collectDeepseekOutput(
    response: Response,
    options: CollectDeepseekOutputOptions = {},
): Promise<CollectedDeepseekOutput>
{
    if (!response.body)
    {
        throw new Error("DeepSeek response body is empty");
    }

    const decoder = new TextDecoder();
    const reader = response.body.getReader();
    let buffer = "";
    let outputText = "";
    let parentMessageId: number | null = null;
    const throwIfAborted = (): void =>
    {
        if (!options.signal?.aborted) return;
        throw options.signal.reason instanceof Error
            ? options.signal.reason
            : new Error("Запрос прерван");
    };

    const flushLine = (line: string): void =>
    {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) return;

        const payload = trimmed.slice(5).trim();
        if (payload.length === 0 || payload === "[DONE]") return;

        let parsed: unknown = payload;
        try
        {
            parsed = JSON.parse(payload) as unknown;
        }
        catch
        {
            parsed = payload;
        }

        const normalized = normalizeEventPayload(parsed);

        if (isRecord(normalized))
        {
            const extractedParentMessageId = extractParentMessageId(normalized);
            if (extractedParentMessageId !== null)
            {
                parentMessageId = extractedParentMessageId;
            }
        }

        let textChunk = extractTextFromEvent(normalized);
        if (textChunk.length === 0 && typeof normalized === "string")
        {
            textChunk = normalized;
        }
        if (textChunk.length === 0 && typeof parsed === "string")
        {
            textChunk = parsed;
        }
        if (textChunk.length === 0) return;

        outputText += textChunk;
        options.onTextChunk?.(textChunk);
    };

    while (true)
    {
        throwIfAborted();
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines)
        {
            flushLine(line);
        }
    }

    if (buffer.trim().length > 0)
    {
        throwIfAborted();
        flushLine(buffer);
    }

    return {
        text: outputText.trim(),
        parentMessageId,
    };
}
