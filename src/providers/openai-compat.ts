import type { ILLMProvider, ProviderCallOptions, ProviderConfig, ProviderInfo } from "./types";
import OpenAI from "openai";

type OpenAICompatId = "openai" | "openrouter" | "hugging-face" | "ollama" | "lm-studio";

const DEFAULTS: Record<OpenAICompatId, { label: string; baseUrl: string }> = {
    "openai":        { label: "OpenAI",       baseUrl: "https://api.openai.com/v1" },
    "openrouter":    { label: "OpenRouter",   baseUrl: "https://openrouter.ai/api/v1" },
    "hugging-face":  { label: "HuggingFace",  baseUrl: "https://router.huggingface.co/v1" },
    "ollama":        { label: "Ollama",       baseUrl: "http://localhost:11434/v1" },
    "lm-studio":     { label: "LM Studio",    baseUrl: "http://localhost:1234/v1" },
};

type OpenAICompatConfig = Extract<ProviderConfig, { id: OpenAICompatId }>;

export class OpenAICompatProvider implements ILLMProvider
{
    private readonly client: OpenAI;

    constructor(
        readonly info: ProviderInfo,
        private readonly baseUrl: string,
        private readonly apiKey: string,
        private readonly model: string,
    ) {
        this.client = new OpenAI({
            baseURL: this.baseUrl,
            apiKey: this.apiKey || "local",
        });
    }

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

    async *complete(prompt: string, options?: ProviderCallOptions): AsyncIterable<string>
    {
        const stream = await this.client.chat.completions.create({
            model: this.model,
            messages: [{ role: "user", content: prompt }],
            stream: true,
            temperature: 0.7,
        }, {
            signal: options?.signal,
        });

        for await (const chunk of stream)
        {
            const choices = chunk.choices;
            if (!choices.length) continue;
            const content = choices[0]?.delta?.content;
            if (typeof content !== "string" || content.length === 0) continue;
            yield content;
        }
    }
}
