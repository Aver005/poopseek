import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import type { ProviderConfig } from "@/providers";

export type RuntimeConfig = {
    token: string | null;
    provider: ProviderConfig | null;
    configuredProviders: ProviderConfig[];
    userName: string | null;
    onboardingDone: boolean;
};

type RuntimeConfigLoadResult = {
    config: RuntimeConfig;
    exists: boolean;
};

export function normalizeOptionalString(value: string | null | undefined): string | null
{
    if (!value) return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

export function getFirstEnvValue(keys: readonly string[]): string | null
{
    for (const key of keys)
    {
        const candidate = normalizeOptionalString(process.env[key]);
        if (candidate !== null) return candidate;
    }

    return null;
}

export function getRuntimeConfigPath(): string
{
    const appDataPath = normalizeOptionalString(process.env.APPDATA);
    const basePath = appDataPath ?? path.join(os.homedir(), "AppData", "Roaming");
    return path.join(basePath, "poopseek", "config.json");
}

function parseProviderConfig(raw: unknown): ProviderConfig | null
{
    if (typeof raw !== "object" || raw === null) return null;
    const obj = raw as Record<string, unknown>;
    if (typeof obj.id !== "string") return null;

    switch (obj.id)
    {
        case "deepseek-web":
            return { id: "deepseek-web" };
        case "openai":
            if (typeof obj.apiKey === "string" && typeof obj.model === "string")
                return { id: "openai", apiKey: obj.apiKey, model: obj.model, baseUrl: typeof obj.baseUrl === "string" ? obj.baseUrl : undefined };
            return null;
        case "openrouter":
            if (typeof obj.apiKey === "string" && typeof obj.model === "string")
                return { id: "openrouter", apiKey: obj.apiKey, model: obj.model };
            return null;
        case "hugging-face":
            if (typeof obj.apiKey === "string" && typeof obj.model === "string")
                return { id: "hugging-face", apiKey: obj.apiKey, model: obj.model };
            return null;
        case "claude":
            if (typeof obj.apiKey === "string" && typeof obj.model === "string")
                return { id: "claude", apiKey: obj.apiKey, model: obj.model };
            return null;
        case "gemini":
            if (typeof obj.apiKey === "string" && typeof obj.model === "string")
                return { id: "gemini", apiKey: obj.apiKey, model: obj.model };
            return null;
        case "ollama":
            if (typeof obj.baseUrl === "string" && typeof obj.model === "string")
                return { id: "ollama", baseUrl: obj.baseUrl, model: obj.model };
            return null;
        case "lm-studio":
            if (typeof obj.baseUrl === "string" && typeof obj.model === "string")
                return { id: "lm-studio", baseUrl: obj.baseUrl, model: obj.model };
            return null;
        default:
            return null;
    }
}

function parseProviderList(raw: unknown): ProviderConfig[]
{
    if (!Array.isArray(raw)) return [];
    return raw.map(parseProviderConfig).filter((p): p is ProviderConfig => p !== null);
}

function parseRuntimeConfig(raw: unknown): RuntimeConfig
{
    if (typeof raw !== "object" || raw === null)
        return { token: null, provider: null, configuredProviders: [], userName: null, onboardingDone: false };

    const obj = raw as Record<string, unknown>;
    const token = typeof obj.token === "string" ? normalizeOptionalString(obj.token) : null;
    const provider = parseProviderConfig(obj.provider);
    const configuredProviders = parseProviderList(obj.configuredProviders);
    const userName = typeof obj.userName === "string" ? normalizeOptionalString(obj.userName) : null;
    const onboardingDone = obj.onboardingDone === true;

    return { token, provider, configuredProviders, userName, onboardingDone };
}

export async function loadRuntimeConfig(configPath: string): Promise<RuntimeConfigLoadResult>
{
    try
    {
        const configRaw = await fs.promises.readFile(configPath, "utf8");
        const parsed = JSON.parse(configRaw) as unknown;
        return { config: parseRuntimeConfig(parsed), exists: true };
    }
    catch (error)
    {
        const nodeError = error as NodeJS.ErrnoException;
        if (nodeError.code === "ENOENT")
            return { config: { token: null, provider: null, configuredProviders: [], userName: null, onboardingDone: false }, exists: false };
        if (error instanceof SyntaxError)
            return { config: { token: null, provider: null, configuredProviders: [], userName: null, onboardingDone: false }, exists: true };
        throw error;
    }
}

export async function saveRuntimeConfig(configPath: string, config: RuntimeConfig): Promise<void>
{
    const directoryPath = path.dirname(configPath);
    await fs.promises.mkdir(directoryPath, { recursive: true });

    const payload = JSON.stringify(
        {
            token: config.token,
            provider: config.provider,
            configuredProviders: config.configuredProviders,
            userName: config.userName,
            onboardingDone: config.onboardingDone,
        },
        null,
        4,
    );

    await fs.promises.writeFile(configPath, `${payload}\n`, "utf8");
}

export async function promptForToken(): Promise<string>
{
    const promptInterface = readline.createInterface({ input, output, terminal: true });
    try
    {
        while (true)
        {
            const providedToken = normalizeOptionalString(
                await promptInterface.question("Введите DEEPSEEK_TOKEN: "),
            );
            if (providedToken !== null) return providedToken;
        }
    }
    finally
    {
        promptInterface.close();
    }
}
