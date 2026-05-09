import type { ChatImage, ILLMProvider, ProviderCallOptions, ProviderCapabilities, ProviderConfig, ProviderInfo, ProviderMessage } from "./types";

export class AnthropicProvider implements ILLMProvider
{
    readonly info: ProviderInfo;
    readonly capabilities: ProviderCapabilities = { webSearch: false, thinking: true };

    constructor(
        private readonly apiKey: string,
        private readonly model: string,
        private pendingImages: ChatImage[] = [],
    )
    {
        this.info = { id: "claude", label: "Claude (Anthropic)", model };
    }

    static fromConfig(config: Extract<ProviderConfig, { id: "claude" }>): AnthropicProvider
    {
        return new AnthropicProvider(config.apiKey, config.model);
    }

    async reset(): Promise<void> {}

    async clone(): Promise<ILLMProvider>
    {
        return new AnthropicProvider(this.apiKey, this.model);
    }

    async withImages(images: ChatImage[]): Promise<ILLMProvider>
    {
        return new AnthropicProvider(this.apiKey, this.model, [...images]);
    }

    async listModels(): Promise<string[]>
    {
        return [
            "claude-opus-4-7",
            "claude-sonnet-4-6",
            "claude-haiku-4-5-20251001",
            "claude-3-5-sonnet-20241022",
            "claude-3-5-haiku-20241022",
            "claude-3-opus-20240229",
        ];
    }

    async *complete(messages: ProviderMessage[], system: string, options?: ProviderCallOptions): AsyncIterable<string>
    {
        const imgs = this.pendingImages.splice(0);

        const anthropicMessages = messages.map((msg, idx) =>
        {
            if (msg.role === "tool")
            {
                return {
                    role: "user" as const,
                    content: `[TOOL RESULT: ${msg.name ?? "unknown"}]\n${msg.content}`,
                };
            }

            if (idx === messages.length - 1 && msg.role === "user" && imgs.length > 0)
            {
                const content: unknown[] = imgs.map((img) => ({
                    type: "image",
                    source: { type: "base64", media_type: img.mimeType, data: img.data },
                }));
                content.push({ type: "text", text: msg.content });
                return { role: "user" as const, content };
            }

            return { role: msg.role as "user" | "assistant", content: msg.content };
        });

        const body: Record<string, unknown> = {
            model: this.model,
            max_tokens: 16000,
            stream: true,
            messages: anthropicMessages,
        };

        if (system.trim().length > 0) body.system = system;

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
            signal: options?.signal,
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
