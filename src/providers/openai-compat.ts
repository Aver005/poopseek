import type { ILLMProvider, ProviderCallOptions, ProviderConfig, ProviderInfo } from "./types";

type OpenAICompatId = "openai" | "openrouter" | "hugging-face" | "ollama" | "lm-studio";

const DEFAULTS: Record<OpenAICompatId, { label: string; baseUrl: string }> = {
    "openai":        { label: "OpenAI",       baseUrl: "https://api.openai.com/v1" },
    "openrouter":    { label: "OpenRouter",   baseUrl: "https://openrouter.ai/api/v1" },
    "hugging-face":  { label: "HuggingFace",  baseUrl: "https://api-inference.huggingface.co/v1" },
    "ollama":        { label: "Ollama",       baseUrl: "http://localhost:11434/v1" },
    "lm-studio":     { label: "LM Studio",    baseUrl: "http://localhost:1234/v1" },
};

type OpenAICompatConfig = Extract<ProviderConfig, { id: OpenAICompatId }>;

export class OpenAICompatProvider implements ILLMProvider
{
    constructor(
        readonly info: ProviderInfo,
        private readonly baseUrl: string,
        private readonly apiKey: string,
        private readonly model: string,
    ) {}

    static fromConfig(config: OpenAICompatConfig): OpenAICompatProvider
    {
        const defaults = DEFAULTS[config.id];
        const baseUrl = "baseUrl" in config && config.baseUrl ? config.baseUrl : defaults.baseUrl;
        const apiKey = "apiKey" in config ? config.apiKey : "";
        return new OpenAICompatProvider(
            { id: config.id, label: defaults.label },
            baseUrl,
            apiKey,
            config.model,
        );
    }

    async reset(): Promise<void> {}

    async clone(): Promise<ILLMProvider>
    {
        return new OpenAICompatProvider(this.info, this.baseUrl, this.apiKey, this.model);
    }

    async *complete(prompt: string, _options?: ProviderCallOptions): AsyncIterable<string>
    {
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (this.apiKey) headers["Authorization"] = `Bearer ${this.apiKey}`;

        const response = await fetch(`${this.baseUrl}/chat/completions`, {
            method: "POST",
            headers,
            body: JSON.stringify({
                model: this.model,
                messages: [{ role: "user", content: prompt }],
                stream: true,
                temperature: 0.7,
            }),
        });

        if (!response.ok)
        {
            const err = await response.text().catch(() => response.statusText);
            throw new Error(`${this.info.label} error ${response.status}: ${err}`);
        }

        yield* parseSSEStream(response);
    }
}

async function* parseSSEStream(response: Response): AsyncIterable<string>
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
            if (!payload || payload === "[DONE]") continue;
            try
            {
                const parsed = JSON.parse(payload) as Record<string, unknown>;
                const choices = parsed.choices;
                if (!Array.isArray(choices) || choices.length === 0) continue;
                const delta = (choices[0] as Record<string, unknown>).delta;
                if (typeof delta !== "object" || !delta) continue;
                const content = (delta as Record<string, unknown>).content;
                if (typeof content === "string" && content.length > 0) yield content;
            }
            catch { /* ignore malformed lines */ }
        }
    }
}
