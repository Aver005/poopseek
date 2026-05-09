import type { ChatImage, ILLMProvider, ProviderCallOptions, ProviderCapabilities, ProviderConfig, ProviderInfo, ProviderMessage } from "./types";
import OpenAI from "openai";

type OpenAICompatId = "openai" | "openrouter" | "hugging-face" | "ollama" | "lm-studio";

const DEFAULTS: Record<OpenAICompatId, { label: string; baseUrl: string }> = {
    "openai":        { label: "OpenAI",      baseUrl: "https://api.openai.com/v1" },
    "openrouter":    { label: "OpenRouter",  baseUrl: "https://openrouter.ai/api/v1" },
    "hugging-face":  { label: "HuggingFace", baseUrl: "https://router.huggingface.co/v1" },
    "ollama":        { label: "Ollama",      baseUrl: "http://localhost:11434/v1" },
    "lm-studio":     { label: "LM Studio",  baseUrl: "http://localhost:1234/v1" },
};

const CAPABILITIES: Record<OpenAICompatId, ProviderCapabilities> = {
    "openai":       { webSearch: false, thinking: false },
    "openrouter":   { webSearch: true,  thinking: false },
    "hugging-face": { webSearch: false, thinking: false },
    "ollama":       { webSearch: false, thinking: false },
    "lm-studio":    { webSearch: false, thinking: false },
};

type OpenAICompatConfig = Extract<ProviderConfig, { id: OpenAICompatId }>;

type OpenRouterWebSearchTool = { readonly type: "openrouter:web_search" };

type OpenRouterCreateParams = Omit<OpenAI.Chat.ChatCompletionCreateParamsStreaming, "tools"> & {
    tools?: Array<OpenAI.Chat.ChatCompletionTool | OpenRouterWebSearchTool>;
};

export class OpenAICompatProvider implements ILLMProvider
{
    private readonly client: OpenAI;
    readonly capabilities: ProviderCapabilities;
    private pendingImages: ChatImage[] = [];

    constructor(
        readonly info: ProviderInfo,
        private readonly baseUrl: string,
        private readonly apiKey: string,
        private readonly model: string,
        capabilities: ProviderCapabilities,
        pendingImages: ChatImage[] = [],
    ) {
        this.client = new OpenAI({
            baseURL: this.baseUrl,
            apiKey: this.apiKey || "local",
        });
        this.capabilities = capabilities;
        this.pendingImages = pendingImages;
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
            CAPABILITIES[config.id],
        );
    }

    async reset(): Promise<void> {}

    async clone(): Promise<ILLMProvider>
    {
        return new OpenAICompatProvider(this.info, this.baseUrl, this.apiKey, this.model, this.capabilities);
    }

    async withImages(images: ChatImage[]): Promise<ILLMProvider>
    {
        return new OpenAICompatProvider(this.info, this.baseUrl, this.apiKey, this.model, this.capabilities, [...images]);
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
        const imgs = this.pendingImages.splice(0);
        const openAIMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [];

        if (system.trim().length > 0)
        {
            openAIMessages.push({ role: "system", content: system });
        }

        for (let i = 0; i < messages.length; i++)
        {
            const msg = messages[i]!;
            if (msg.role === "tool")
            {
                openAIMessages.push({
                    role: "user",
                    content: `[TOOL RESULT: ${msg.name ?? "unknown"}]\n${msg.content}`,
                });
            }
            else if (i === messages.length - 1 && msg.role === "user" && imgs.length > 0)
            {
                const content: OpenAI.Chat.ChatCompletionContentPart[] = imgs.map((img) => ({
                    type: "image_url" as const,
                    image_url: { url: `data:${img.mimeType};base64,${img.data}` },
                }));
                content.push({ type: "text", text: msg.content });
                openAIMessages.push({ role: "user", content });
            }
            else
            {
                openAIMessages.push({ role: msg.role, content: msg.content });
            }
        }

        const tools: Array<OpenAI.Chat.ChatCompletionTool | OpenRouterWebSearchTool> | undefined =
            this.capabilities.webSearch && options?.searchEnabled
                ? [{ type: "openrouter:web_search" }]
                : undefined;

        const params: OpenRouterCreateParams = {
            model: this.model,
            messages: openAIMessages,
            stream: true,
            temperature: 0.7,
            tools,
        };

        const stream = await this.client.chat.completions.create(
            params as OpenAI.Chat.ChatCompletionCreateParamsStreaming,
            { signal: options?.signal },
        );

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
