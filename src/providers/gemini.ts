import type { ILLMProvider, ProviderCallOptions, ProviderConfig, ProviderInfo, ProviderMessage } from "./types";

export class GeminiProvider implements ILLMProvider
{
    readonly info: ProviderInfo = { id: "gemini", label: "Gemini (Google)" };

    constructor(
        private readonly apiKey: string,
        private readonly model: string,
    ) {}

    static fromConfig(config: Extract<ProviderConfig, { id: "gemini" }>): GeminiProvider
    {
        return new GeminiProvider(config.apiKey, config.model);
    }

    async reset(): Promise<void> {}

    async clone(): Promise<ILLMProvider>
    {
        return new GeminiProvider(this.apiKey, this.model);
    }

    async *complete(messages: ProviderMessage[], system: string, options?: ProviderCallOptions): AsyncIterable<string>
    {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:streamGenerateContent?alt=sse&key=${this.apiKey}`;

        const generationConfig: Record<string, unknown> = {
            temperature: 0.7,
            maxOutputTokens: 8192,
        };

        if (options?.thinkingEnabled)
        {
            generationConfig.thinkingConfig = { thinkingBudget: 8192 };
        }

        // Map to Gemini roles; tool results become user turns
        const rawContents = messages.map((msg) =>
        {
            const text = msg.role === "tool"
                ? `[TOOL RESULT: ${msg.name ?? "unknown"}]\n${msg.content}`
                : msg.content;
            const role = msg.role === "assistant" ? "model" : "user";
            return { role, parts: [{ text }] };
        });

        // Gemini rejects consecutive same-role entries — merge them
        const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [];
        for (const entry of rawContents)
        {
            const last = contents[contents.length - 1];
            if (last && last.role === entry.role)
            {
                last.parts.push(...entry.parts);
            }
            else
            {
                contents.push({ role: entry.role, parts: [...entry.parts] });
            }
        }

        const body: Record<string, unknown> = { contents, generationConfig };
        if (system.trim().length > 0)
        {
            body.systemInstruction = { parts: [{ text: system }] };
        }

        const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
            signal: options?.signal,
        });

        if (!response.ok)
        {
            const err = await response.text().catch(() => response.statusText);
            throw new Error(`Gemini error ${response.status}: ${err}`);
        }

        yield* parseGeminiStream(response);
    }
}

async function* parseGeminiStream(response: Response): AsyncIterable<string>
{
    if (!response.body) return;
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true)
    {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines)
        {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data:")) continue;
            const payload = trimmed.slice(5).trim();
            if (!payload) continue;
            try
            {
                const parsed = JSON.parse(payload) as Record<string, unknown>;
                const candidates = parsed.candidates;
                if (!Array.isArray(candidates) || candidates.length === 0) continue;
                const content = (candidates[0] as Record<string, unknown>).content as Record<string, unknown>;
                if (!content) continue;
                const parts = content.parts;
                if (!Array.isArray(parts)) continue;
                for (const part of parts)
                {
                    const text = (part as Record<string, unknown>).text;
                    if (typeof text === "string" && text.length > 0) yield text;
                }
            }
            catch { /* ignore malformed lines */ }
        }
    }
}
