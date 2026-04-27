import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { PROVIDER_IDS, type ProviderConfig } from "@/providers";
import type { RuntimeConfig } from "@/cli/runtime-config";
import { normalizeOptionalString } from "@/cli/runtime-config";

type ProviderId = (typeof PROVIDER_IDS)[number];

const PROVIDER_META: Record<ProviderId, { label: string; hint: string }> = {
    "deepseek-web": { label: "DeepSeek (web)",     hint: "бесплатно, нужен аккаунт deepseek.com" },
    "openrouter":   { label: "OpenRouter",         hint: "1000+ моделей, нужен API ключ" },
    "openai":       { label: "OpenAI",             hint: "GPT-4o, o3 и другие" },
    "hugging-face": { label: "HuggingFace",        hint: "открытые модели" },
    "claude":       { label: "Claude (Anthropic)",  hint: "Claude Opus/Sonnet" },
    "gemini":       { label: "Gemini (Google)",    hint: "Gemini 2.5 Pro и другие" },
    "ollama":       { label: "Ollama",             hint: "локально, без API ключа" },
    "lm-studio":    { label: "LM Studio",          hint: "локально, без API ключа" },
};

type InputFn = (prompt: string) => Promise<string>;

function line(text = ""): void { stdout.write(`${text}\n`); }
function dim(text: string): string { return `\x1b[2m${text}\x1b[0m`; }
function green(text: string): string { return `\x1b[32m${text}\x1b[0m`; }
function cyan(text: string): string { return `\x1b[36m${text}\x1b[0m`; }
function bold(text: string): string { return `\x1b[1m${text}\x1b[0m`; }
function yellow(text: string): string { return `\x1b[33m${text}\x1b[0m`; }

function makeReadLine(): { readLine: InputFn; close: () => void }
{
    const rl = readline.createInterface({ input: stdin, output: stdout, terminal: false });
    const readLine: InputFn = (prompt) =>
    {
        stdout.write(prompt);
        return new Promise((resolve) => rl.once("line", resolve));
    };
    return { readLine, close: () => rl.close() };
}

export async function promptLine(
    readLine: InputFn,
    prompt: string,
    defaultValue?: string,
): Promise<string>
{
    const hint = defaultValue ? dim(` (Enter = ${defaultValue})`) : "";
    const raw = await readLine(`  ${cyan("?")} ${prompt}${hint}: `);
    const trimmed = raw.trim();
    return trimmed.length > 0 ? trimmed : (defaultValue ?? "");
}

async function collectCredentials(
    id: ProviderId,
    readLine: InputFn,
    existingToken: string | null,
): Promise<{ config: ProviderConfig; token?: string } | null>
{
    const meta = PROVIDER_META[id];
    line();
    line(`  ${bold(`── ${meta.label} ──`)}`);

    switch (id)
    {
        case "deepseek-web":
        {
            const envToken = normalizeOptionalString(process.env.DEEPSEEK_TOKEN);
            if (envToken)
            {
                line(`  ${dim("DEEPSEEK_TOKEN найден в окружении — используется автоматически.")}`);
                return { config: { id: "deepseek-web" }, token: envToken };
            }
            const raw = await promptLine(readLine, "DEEPSEEK_TOKEN", existingToken ?? undefined);
            const token = normalizeOptionalString(raw);
            if (!token) { line(`  ${dim("Токен не введён — пропущено.")}`); return null; }
            return { config: { id: "deepseek-web" }, token };
        }

        case "openrouter":
        {
            const apiKey = await promptLine(readLine, "API Key");
            if (!apiKey) { line(`  ${dim("Пропущено.")}`); return null; }
            const model = await promptLine(readLine, "Модель", "openai/gpt-4o");
            return { config: { id: "openrouter", apiKey, model } };
        }

        case "openai":
        {
            const apiKey = await promptLine(readLine, "API Key");
            if (!apiKey) { line(`  ${dim("Пропущено.")}`); return null; }
            const model = await promptLine(readLine, "Модель", "gpt-4o");
            const baseUrl = await promptLine(readLine, "Base URL", "https://api.openai.com/v1");
            return { config: { id: "openai", apiKey, model, baseUrl } };
        }

        case "hugging-face":
        {
            const apiKey = await promptLine(readLine, "API Key");
            if (!apiKey) { line(`  ${dim("Пропущено.")}`); return null; }
            const model = await promptLine(readLine, "Модель", "meta-llama/Llama-3.1-8B-Instruct");
            return { config: { id: "hugging-face", apiKey, model } };
        }

        case "claude":
        {
            const apiKey = await promptLine(readLine, "Anthropic API Key");
            if (!apiKey) { line(`  ${dim("Пропущено.")}`); return null; }
            const model = await promptLine(readLine, "Модель", "claude-opus-4-7");
            return { config: { id: "claude", apiKey, model } };
        }

        case "gemini":
        {
            const apiKey = await promptLine(readLine, "Google AI API Key");
            if (!apiKey) { line(`  ${dim("Пропущено.")}`); return null; }
            const model = await promptLine(readLine, "Модель", "gemini-2.5-pro");
            return { config: { id: "gemini", apiKey, model } };
        }

        case "ollama":
        {
            const baseUrl = await promptLine(readLine, "URL", "http://localhost:11434/v1");
            const model = await promptLine(readLine, "Модель", "llama3.2");
            return { config: { id: "ollama", baseUrl, model } };
        }

        case "lm-studio":
        {
            const baseUrl = await promptLine(readLine, "URL", "http://localhost:1234/v1");
            const model = await promptLine(readLine, "Модель", "local-model");
            return { config: { id: "lm-studio", baseUrl, model } };
        }
    }
}

function parseProviderSelection(input: string): ProviderId[]
{
    const nums = input
        .split(/[\s,]+/)
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => !isNaN(n) && n >= 1 && n <= PROVIDER_IDS.length);
    return [...new Set(nums)].map((n) => PROVIDER_IDS[n - 1]!);
}

export interface OnboardingResult
{
    userName: string | null;
    configuredProviders: ProviderConfig[];
    activeProvider: ProviderConfig | null;
    token: string | null;
}

export async function runOnboarding(
    existing: RuntimeConfig,
    configPath: string,
): Promise<OnboardingResult>
{
    const { readLine, close } = makeReadLine();

    try
    {
        line();
        line(bold("┌─────────────────────────────────────────┐"));
        line(`${bold("│")}     ${green("Добро пожаловать в PoopSeek! 💩")}      ${bold("│")}`);
        line(bold("└─────────────────────────────────────────┘"));
        line();

        // ── Шаг 1: Имя ──────────────────────────────────────────

        const systemName = normalizeOptionalString(process.env.USERNAME ?? process.env.USER) ?? "пользователь";
        const currentName = existing.userName ?? systemName;
        line(`${cyan("Шаг 1/2")} ${dim("— Как вас называть?")}`);
        const rawName = await promptLine(readLine, "Имя", currentName);
        const userName = normalizeOptionalString(rawName);
        line();

        // ── Шаг 2: Провайдеры ────────────────────────────────────

        line(`${cyan("Шаг 2/2")} ${dim("— Настройка провайдеров LLM")}`);
        line();
        line("  Доступные провайдеры:");
        line();

        PROVIDER_IDS.forEach((id, i) =>
        {
            const meta = PROVIDER_META[id];
            const num = cyan(`${i + 1}.`);
            const label = id.padEnd(14);
            const name = meta.label.padEnd(24);
            line(`    ${num} ${label} ${name} ${dim(meta.hint)}`);
        });

        line();

        const defaultNums = existing.configuredProviders.length > 0
            ? existing.configuredProviders
                .map((p) => PROVIDER_IDS.indexOf(p.id as ProviderId) + 1)
                .filter((n) => n > 0)
                .join(" ")
            : "1";

        const selRaw = await promptLine(
            readLine,
            `Номера через пробел ${dim("(0 = пропустить все)")}`,
            defaultNums,
        );

        const selectedIds = selRaw.trim() === "0"
            ? []
            : parseProviderSelection(selRaw || defaultNums);

        // ── Сбор учётных данных ───────────────────────────────────

        const configuredProviders: ProviderConfig[] = [];
        let token = existing.token;

        for (const id of selectedIds)
        {
            const result = await collectCredentials(id, readLine, token);
            if (!result) continue;
            if (result.token !== undefined) token = result.token;
            configuredProviders.push(result.config);
        }

        const activeProvider = configuredProviders[0] ?? null;

        // ── Итоговое сообщение ────────────────────────────────────

        line();
        line(bold("─".repeat(45)));
        line();

        if (configuredProviders.length > 0)
        {
            line(`  ${green("✓")} Настроено провайдеров: ${bold(String(configuredProviders.length))}`);
            const first = configuredProviders[0]!;
            line(`  ${dim("Активный:")}          ${PROVIDER_META[first.id as ProviderId]?.label ?? first.id}`);
        }
        else
        {
            line(`  ${yellow("!")} Провайдеры не настроены.`);
        }

        if (userName) line(`  ${dim("Обращение:")}         ${userName}`);
        line();
        line(`  ${dim("Изменить настройки:")}  ${cyan("/auth")}`);
        line(`  ${dim("Сменить провайдер:")}   ${cyan("/provider")}`);
        line(`  ${dim("Конфиг:")}              ${cyan(configPath)}`);
        line();
        line(bold("─".repeat(45)));
        line();

        return { userName, configuredProviders, activeProvider, token };
    }
    finally
    {
        close();
    }
}
