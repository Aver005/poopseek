import type { ILLMProvider, ProviderCallOptions, ProviderConfig, ProviderInfo } from "./types";

export class AnthropicProvider implements ILLMProvider
{
    readonly info: ProviderInfo = { id: "claude", label: "Claude (Anthropic)" };

    constructor(
        private readonly apiKey: string,
        private readonly model: string,
    ) {}

    static fromConfig(config: Extract<ProviderConfig, { id: "claude" }>): AnthropicProvider
    {
        return new AnthropicProvider(config.apiKey, config.model);
    }

    async reset(): Promise<void> {}

    async clone(): Promise<ILLMProvider>
    {
        return new AnthropicProvider(this.apiKey, this.model);
    }

    async *complete(prompt: string, options?: ProviderCallOptions): AsyncIterable<string>
    {
        const body: Record<string, unknown> = {
            model: this.model,
            max_tokens: 16000,
            stream: true,
            messages: [{ role: "user", content: prompt }],
        };

        if (options?.thinkingEnabled)
        {
            body.thinking = { type: "enabled", budget_tokens: 10000 };
        }

        const response = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-api-key": this.apiKey,
                "anthropic-version": "2023-06-01",
                ...(options?.thinkingEnabled ? { "anthropic-beta": "interleaved-thinking-2025-05-14" } : {}),
            },
            body: JSON.stringify(body),
        });

        if (!response.ok)
        {
            const err = await response.text().catch(() => response.statusText);
            throw new Error(`Claude error ${response.status}: ${err}`);
        }

        yield* parseAnthropicStream(response);
    }
}

async function* parseAnthropicStream(response: Response): AsyncIterable<string>
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
                if (parsed.type !== "content_block_delta") continue;
                const delta = parsed.delta as Record<string, unknown>;
                if (delta.type === "text_delta" && typeof delta.text === "string" && delta.text.length > 0)
                {
                    yield delta.text;
                }
            }
            catch { /* ignore malformed lines */ }
        }
    }
}
