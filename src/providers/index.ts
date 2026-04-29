export type { ILLMProvider, ProviderCallOptions, ProviderCapabilities, ProviderConfig, ProviderInfo } from "./types";
export { DeepseekWebProvider } from "./deepseek-web";
export { OpenAICompatProvider } from "./openai-compat";
export { AnthropicProvider } from "./anthropic";
export { GeminiProvider } from "./gemini";

import type { ILLMProvider, ProviderConfig } from "./types";
import { DeepseekWebProvider } from "./deepseek-web";
import { OpenAICompatProvider } from "./openai-compat";
import { AnthropicProvider } from "./anthropic";
import { GeminiProvider } from "./gemini";

export const PROVIDER_IDS = [
    "deepseek-web",
    "openrouter",
    "openai",
    "hugging-face",
    "claude",
    "gemini",
    "ollama",
    "lm-studio",
] as const;

export type ProviderId = (typeof PROVIDER_IDS)[number];

export async function createProvider(config: ProviderConfig, token: string): Promise<ILLMProvider>
{
    switch (config.id)
    {
        case "deepseek-web":
            return DeepseekWebProvider.create(token);
        case "openai":
        case "openrouter":
        case "hugging-face":
        case "ollama":
        case "lm-studio":
            return OpenAICompatProvider.fromConfig(config);
        case "claude":
            return AnthropicProvider.fromConfig(config);
        case "gemini":
            return GeminiProvider.fromConfig(config);
    }
}
