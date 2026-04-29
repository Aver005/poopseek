import type { ILLMProvider, ProviderCallOptions, ProviderConfig, ProviderInfo, ProviderMessage } from "./types";
import OpenAI from "openai";

type OpenAICompatId = "openai" | "openrouter" | "hugging-face" | "ollama" | "lm-studio";

const DEFAULTS: Record<OpenAICompatId, { label: string; baseUrl: string }> = {
    "openai":        { label: "OpenAI",      baseUrl: "https://api.openai.com/v1" },
    "openrouter":    { label: "OpenRouter",  baseUrl: "https://openrouter.ai/api/v1" },
    "hugging-face":  { label: "HuggingFace", baseUrl: "https://router.huggingface.co/v1" },
    "ollama":        { label: "Ollama",      baseUrl: "http://localhost:11434/v1" },
    "lm-studio":     { label: "LM Studio",  baseUrl: "http://localhost:1234/v1" },
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
            { id: config.id, label: defaults.label, model: config.model },
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

    async listModels(): Promise<string[]>
    {
        try
        {
            const list = await this.client.models.list();
            return list.data.map((m) => m.id).sort();
        }
        catch
        {
            return [];
        }
    }

    async *complete(messages: ProviderMessage[], system: string, options?: ProviderCallOptions): AsyncIterable<string>
    {
        const openAIMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [];

        if (system.trim().length > 0)
        {
            openAIMessages.push({ role: "system", content: system });
        }

        for (const msg of messages)
        {
            if (msg.role === "tool")
            {
                openAIMessages.push({
                    role: "user",
                    content: `[TOOL RESULT: ${msg.name ?? "unknown"}]\n${msg.content}`,
                });
            }
            else
            {
                openAIMessages.push({ role: msg.role, content: msg.content });
            }
        }

        const stream = await this.client.chat.completions.create({
            model: this.model,
            messages: openAIMessages,
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
