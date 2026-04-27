export interface ProviderCallOptions
{
    thinkingEnabled?: boolean;
    searchEnabled?: boolean;
    modelVariant?: string;
}

export interface ProviderInfo
{
    id: string;
    label: string;
}

export interface ILLMProvider
{
    readonly info: ProviderInfo;
    complete(prompt: string, options?: ProviderCallOptions): AsyncIterable<string>;
    reset(): Promise<void>;
    clone(): Promise<ILLMProvider>;
}

export type ProviderConfig =
    | { id: "deepseek-web" }
    | { id: "openai"; apiKey: string; model: string; baseUrl?: string }
    | { id: "openrouter"; apiKey: string; model: string }
    | { id: "hugging-face"; apiKey: string; model: string }
    | { id: "claude"; apiKey: string; model: string }
    | { id: "gemini"; apiKey: string; model: string }
    | { id: "ollama"; baseUrl: string; model: string }
    | { id: "lm-studio"; baseUrl: string; model: string };
