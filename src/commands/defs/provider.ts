import { writeLine } from "../io";
import type { Command, CommandsContext } from "../types";
import { createProvider, PROVIDER_IDS, type ProviderConfig } from "@/providers";

type ProviderId = (typeof PROVIDER_IDS)[number];

const PROVIDER_LABELS: Record<ProviderId, string> = {
    "deepseek-web": "DeepSeek (web, бесплатно)",
    "openrouter":   "OpenRouter",
    "openai":       "OpenAI",
    "hugging-face": "HuggingFace",
    "claude":       "Claude (Anthropic)",
    "gemini":       "Gemini (Google)",
    "ollama":       "Ollama (локально)",
    "lm-studio":    "LM Studio (локально)",
};

function isProviderId(value: string): value is ProviderId
{
    return (PROVIDER_IDS as readonly string[]).includes(value);
}

async function promptLine(
    waitForInput: () => Promise<string>,
    prompt: string,
    defaultValue?: string,
): Promise<string>
{
    const hint = defaultValue ? ` (Enter = ${defaultValue})` : "";
    writeLine(`${prompt}${hint}:`);
    const raw = (await waitForInput()).trim();
    if (!raw && defaultValue) return defaultValue;
    return raw;
}

async function buildConfig(
    id: ProviderId,
    waitForInput: () => Promise<string>,
): Promise<ProviderConfig | null>
{
    switch (id)
    {
        case "deepseek-web":
            return { id: "deepseek-web" };

        case "openai":
        {
            const apiKey = await promptLine(waitForInput, "OpenAI API Key");
            if (!apiKey) return null;
            const model = await promptLine(waitForInput, "Модель", "gpt-4o");
            const baseUrl = await promptLine(waitForInput, "Base URL (Enter = официальный)", "https://api.openai.com/v1");
            return { id: "openai", apiKey, model, baseUrl };
        }

        case "openrouter":
        {
            const apiKey = await promptLine(waitForInput, "OpenRouter API Key");
            if (!apiKey) return null;
            const model = await promptLine(waitForInput, "Модель", "openai/gpt-4o");
            return { id: "openrouter", apiKey, model };
        }

        case "hugging-face":
        {
            const apiKey = await promptLine(waitForInput, "HuggingFace API Key");
            if (!apiKey) return null;
            const model = await promptLine(waitForInput, "Модель", "meta-llama/Llama-3.1-8B-Instruct");
            return { id: "hugging-face", apiKey, model };
        }

        case "claude":
        {
            const apiKey = await promptLine(waitForInput, "Anthropic API Key");
            if (!apiKey) return null;
            const model = await promptLine(waitForInput, "Модель", "claude-opus-4-7");
            return { id: "claude", apiKey, model };
        }

        case "gemini":
        {
            const apiKey = await promptLine(waitForInput, "Google AI API Key");
            if (!apiKey) return null;
            const model = await promptLine(waitForInput, "Модель", "gemini-2.5-pro");
            return { id: "gemini", apiKey, model };
        }

        case "ollama":
        {
            const baseUrl = await promptLine(waitForInput, "Ollama URL", "http://localhost:11434/v1");
            const model = await promptLine(waitForInput, "Модель", "llama3.2");
            return { id: "ollama", baseUrl, model };
        }

        case "lm-studio":
        {
            const baseUrl = await promptLine(waitForInput, "LM Studio URL", "http://localhost:1234/v1");
            const model = await promptLine(waitForInput, "Модель", "local-model");
            return { id: "lm-studio", baseUrl, model };
        }
    }
}

export function createProviderCommand(context: CommandsContext): Command
{
    return {
        name: "/provider",
        description: "Показать или сменить провайдера LLM (/provider [id])",
        execute: async (args) =>
        {
            const { getCurrentProvider, setProvider, waitForInput } = context;

            if (!getCurrentProvider || !setProvider || !waitForInput)
            {
                writeLine("");
                writeLine("Управление провайдером недоступно.");
                writeLine("");
                return true;
            }

            const rawId = args[0]?.toLowerCase();

            // Show current + list available
            if (!rawId)
            {
                const current = getCurrentProvider();
                writeLine("");
                writeLine(`Текущий провайдер: ${current.info.label}`);
                writeLine("");
                writeLine("Доступные провайдеры:");
                for (const id of PROVIDER_IDS)
                {
                    const marker = current.info.id === id ? "→" : " ";
                    writeLine(`  ${marker} ${id.padEnd(14)} ${PROVIDER_LABELS[id]}`);
                }
                writeLine("");
                writeLine("Использование: /provider <id>");
                writeLine("");
                return true;
            }

            if (!isProviderId(rawId))
            {
                writeLine("");
                writeLine(`Неизвестный провайдер: ${rawId}`);
                writeLine(`Доступно: ${PROVIDER_IDS.join(", ")}`);
                writeLine("");
                return true;
            }

            writeLine("");
            writeLine(`Переключение на ${PROVIDER_LABELS[rawId]}...`);
            writeLine("");

            const config = await buildConfig(rawId, waitForInput);
            if (!config)
            {
                writeLine("Отменено.");
                writeLine("");
                return true;
            }

            try
            {
                writeLine("Подключение...");
                const newProvider = await createProvider(config, "");
                await setProvider(newProvider, config);
                writeLine(`Провайдер переключён: ${newProvider.info.label}`);
                writeLine("История очищена, новая сессия начата.");
                writeLine("");
            }
            catch (error)
            {
                const message = error instanceof Error ? error.message : String(error);
                writeLine(`Ошибка подключения: ${message}`);
                writeLine("");
            }

            return true;
        },
    };
}
