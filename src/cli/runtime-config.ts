import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

export type RuntimeConfig = {
    token: string | null;
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

function parseRuntimeConfig(raw: unknown): RuntimeConfig
{
    if (typeof raw !== "object" || raw === null)
        return { token: null };

    const maybeConfig = raw as Record<string, unknown>;
    const token = typeof maybeConfig.token === "string"
        ? normalizeOptionalString(maybeConfig.token)
        : null;

    return { token };
}

export async function loadRuntimeConfig(configPath: string): Promise<RuntimeConfigLoadResult>
{
    try
    {
        const configRaw = await fs.promises.readFile(configPath, "utf8");
        const parsed = JSON.parse(configRaw) as unknown;
        return {
            config: parseRuntimeConfig(parsed),
            exists: true,
        };
    }
    catch (error)
    {
        const nodeError = error as NodeJS.ErrnoException;
        if (nodeError.code === "ENOENT")
        {
            return {
                config: { token: null },
                exists: false,
            };
        }

        if (error instanceof SyntaxError)
        {
            return {
                config: { token: null },
                exists: true,
            };
        }

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
        },
        null,
        4,
    );

    await fs.promises.writeFile(configPath, `${payload}\n`, "utf8");
}

export async function promptForToken(): Promise<string>
{
    const promptInterface = readline.createInterface({
        input,
        output,
    });

    try
    {
        while (true)
        {
            const providedToken = normalizeOptionalString(
                await promptInterface.question("Введите DEEPSEEK_TOKEN: "),
            );
            
            if (providedToken !== null)
                return providedToken;
        }
    }
    finally
    {
        promptInterface.close();
    }
}
