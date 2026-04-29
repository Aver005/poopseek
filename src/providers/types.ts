export interface ProviderCallOptions
{
    thinkingEnabled?: boolean;
    searchEnabled?: boolean;
    modelVariant?: string;
    signal?: AbortSignal;
}

export interface ProviderCapabilities
{
    webSearch: boolean;
    thinking: boolean;
}

export interface ProviderInfo
{
    id: string;
    label: string;
    model?: string;
}

export interface ProviderMessage
{
    role: "user" | "assistant" | "tool";
    content: string;
    name?: string;
}

export interface ILLMProvider
{
    readonly info: ProviderInfo;
    readonly capabilities: ProviderCapabilities;
    complete(messages: ProviderMessage[], system: string, options?: ProviderCallOptions): AsyncIterable<string>;
    reset(): Promise<void>;
    clone(): Promise<ILLMProvider>;
    listModels(): Promise<string[]>;
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
