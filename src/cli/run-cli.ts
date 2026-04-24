import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { emitKeypressEvents } from "node:readline";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { collectDeepseekOutput } from "@/bridge/deepseek-stream";
import ContextManager from "@/agent/context-manager";
import AgentLoop from "@/agent/loop";
import ToolExecutor from "@/agent/tool-executor";
import { createHintsRenderer } from "@/cli/command-hints";
import { colors, getColorMode, setTheme } from "@/cli/colors";
import { createGenerationIndicator } from "@/cli/generation-indicator";
import { renderMarkdown } from "@/cli/markdown";
import { getToolProgressMessage } from "@/cli/tool-progress-messages";
import {
    createCommandCompleter,
    createCommandHandlers,
    handleCommand,
} from "@/commands";
import type { Command } from "@/commands/types";
import DeepseekClient from "@/deepseek-client/client/DeepseekClient";
import type { ModelType } from "@/deepseek-client/types";
import { createVariableProcessor } from "@/variables";

type RuntimeConfig = {
    token: string | null;
    version: string | null;
};

type RuntimeConfigLoadResult = {
    config: RuntimeConfig;
    exists: boolean;
};

function normalizeOptionalString(value: string | null | undefined): string | null
{
    if (!value) return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

function getFirstEnvValue(keys: readonly string[]): string | null
{
    for (const key of keys)
    {
        const candidate = normalizeOptionalString(process.env[key]);
        if (candidate !== null)
        {
            return candidate;
        }
    }

    return null;
}

function getRuntimeConfigPath(): string
{
    const appDataPath = normalizeOptionalString(process.env.APPDATA);
    const basePath = appDataPath ?? path.join(os.homedir(), "AppData", "Roaming");
    return path.join(basePath, "poopseek", "config.json");
}

function normalizeRelativeAssetPath(inputPath: string): string
{
    return inputPath.replace(/^[./\\]+/, "");
}

function collectAssetCandidates(relativePath: string): string[]
{
    const sanitizedRelativePath = normalizeRelativeAssetPath(relativePath);
    const runtimeBases = {
        executableDirectory: path.dirname(process.execPath),
        projectRoot: path.resolve(import.meta.dir, "../.."),
        cwd: process.cwd(),
    };

    const basePaths = Object.keys(runtimeBases)
        .map((key) => runtimeBases[key as keyof typeof runtimeBases]);
    const resolvedPaths = basePaths
        .map((basePath) => path.resolve(basePath, sanitizedRelativePath));
    const cwdResolvedPath = path.resolve(process.cwd(), relativePath);

    return Array.from(new Set([cwdResolvedPath, ...resolvedPaths]));
}

function resolveExistingAssetPath(relativePath: string): string
{
    const candidates = collectAssetCandidates(relativePath);
    for (const candidatePath of candidates)
    {
        if (fs.existsSync(candidatePath))
        {
            return candidatePath;
        }
    }

    throw new Error(
        `Asset not found for "${relativePath}". Checked: ${candidates.join(", ")}`,
    );
}

function parseRuntimeConfig(raw: unknown): RuntimeConfig
{
    if (typeof raw !== "object" || raw === null)
    {
        return { token: null, version: null };
    }

    const maybeConfig = raw as Record<string, unknown>;
    const token = typeof maybeConfig.token === "string"
        ? normalizeOptionalString(maybeConfig.token)
        : null;
    const version = typeof maybeConfig.version === "string"
        ? normalizeOptionalString(maybeConfig.version)
        : null;

    return { token, version };
}

async function loadRuntimeConfig(configPath: string): Promise<RuntimeConfigLoadResult>
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
                config: { token: null, version: null },
                exists: false,
            };
        }

        if (error instanceof SyntaxError)
        {
            return {
                config: { token: null, version: null },
                exists: true,
            };
        }

        throw error;
    }
}

async function saveRuntimeConfig(configPath: string, config: RuntimeConfig): Promise<void>
{
    const directoryPath = path.dirname(configPath);
    await fs.promises.mkdir(directoryPath, { recursive: true });

    const payload = JSON.stringify(
        {
            version: config.version,
            token: config.token,
        },
        null,
        4,
    );

    await fs.promises.writeFile(configPath, `${payload}\n`, "utf8");
}

async function promptForToken(): Promise<string>
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
            {
                return providedToken;
            }
        }
    }
    finally
    {
        promptInterface.close();
    }
}

async function readPromptFiles(): Promise<{
    basePrompt: string;
    toolsPrompt: string;
    compactPrompt: string;
}>
{
    const basePromptPath = resolveExistingAssetPath("assets/prompts/base.prompt.md");
    const compactPromptPath = resolveExistingAssetPath("assets/prompts/compact.prompt.md");
    const toolsPromptPath = resolveExistingAssetPath("docs/tools/tool.base.md");

    const [basePrompt, toolsPrompt, compactPrompt] = await Promise.all([
        fs.promises.readFile(basePromptPath, "utf8"),
        fs.promises.readFile(toolsPromptPath, "utf8"),
        fs.promises.readFile(compactPromptPath, "utf8"),
    ]);

    return {
        basePrompt,
        toolsPrompt,
        compactPrompt,
    };
}

export async function runCli(): Promise<void>
{
    const runtimeConfigPath = getRuntimeConfigPath();
    const loadedRuntimeConfig = await loadRuntimeConfig(runtimeConfigPath);
    const envToken = getFirstEnvValue(["DEEPSEEK_TOKEN"]);
    const envVersion = getFirstEnvValue(["POOPSEEK_VERSION", "APP_VERSION"]);
    const appVersion = envVersion ?? loadedRuntimeConfig.config.version ?? "dev";
    const configToken = loadedRuntimeConfig.config.token;
    const token = envToken
        ?? configToken
        ?? await promptForToken();

    const nextRuntimeConfig: RuntimeConfig = { token, version: appVersion };
    const shouldUpdateRuntimeConfig = !loadedRuntimeConfig.exists
        || loadedRuntimeConfig.config.token !== nextRuntimeConfig.token
        || loadedRuntimeConfig.config.version !== nextRuntimeConfig.version;

    if (shouldUpdateRuntimeConfig)
    {
        await saveRuntimeConfig(runtimeConfigPath, nextRuntimeConfig);
    }

    const deepseekClient = new DeepseekClient(token);

    await deepseekClient.initialize();
    const session = await deepseekClient.createSession();

    const prompts = await readPromptFiles();
    const variableProcessor = createVariableProcessor({
        workspaceRoot: process.cwd(),
    });
    const contextManager = new ContextManager(
        prompts.basePrompt,
        prompts.toolsPrompt,
        { maxMessages: 40 },
        variableProcessor,
    );
    const toolExecutor = new ToolExecutor(process.cwd());
    let modelType: ModelType = "default";
    const agentLoop = new AgentLoop(
        deepseekClient,
        session,
        contextManager,
        toolExecutor,
        {
            maxStepsPerTurn: 12,
            getModelType: () => modelType,
        },
    );

    let commands = new Map<string, Command>();
    const rl = readline.createInterface({
        input,
        output,
        completer: createCommandCompleter(() => commands),
    });
    const hintsRenderer = createHintsRenderer(output);
    const generationIndicator = createGenerationIndicator(output);
    const colorMode = getColorMode();

    commands = createCommandHandlers(rl, {
        getSessionInfo: () => `Session ID: ${session.getId()}`,
        getContextStats: () => `Messages in context: ${contextManager.getMessageCount()}`,
        clearHistory: () => contextManager.clearHistory(),
        getTheme: () => getColorMode().theme,
        setTheme: (theme) => setTheme(theme),
        getModelType: () => modelType,
        setModelType: (nextModelType) => modelType = nextModelType,
        compactContext: async () =>
        {
            const before = contextManager.getMessageCount();
            if (before === 0)
            {
                return null;
            }

            const dialogue = contextManager.getDialogueSnapshot();
            const compactPrompt = [
                prompts.compactPrompt.trim(),
                "",
                "## Диалог",
                dialogue,
            ].join("\n");

            const compactSession = await deepseekClient.createSession();
            const response = await deepseekClient.sendMessage(compactPrompt, compactSession, {
                model_type: modelType,
            });
            const compacted = await collectDeepseekOutput(response);
            const summary = compacted.text.trim();
            if (summary.length === 0)
            {
                throw new Error("Модель вернула пустую сводку");
            }

            contextManager.replaceWithCompactSummary(summary);
            return {
                before,
                after: contextManager.getMessageCount(),
                summaryChars: summary.length,
            };
        },
    });
    emitKeypressEvents(input);
    const onKeypress = (): void => hintsRenderer.render(rl.line, commands);
    input.on("keypress", onKeypress);

    output.write(`\n${colors.green("PoopSeek CLI 💩")} | v${appVersion}\n\n`);
    output.write(`${colors.yellow("/help")} для списка команд\n`);
    output.write(`${colors.yellow("/tools")} для списка инструментов\n\n`);
    output.write(`${colors.dim(`Модель: ${colors.magenta(modelType)}`)}\n`);
    output.write(`Цвета ${colorMode.enabled ? colors.green("включены") : colors.red("отключены")}\n`);
    output.write(`Тема: ${colors.cyan(colorMode.theme)}\n\n`);

    try
    {
        while (true)
        {
            const userInput = (await rl.question(`${colors.magenta(">")} `)).trim();
            hintsRenderer.clear();
            if (userInput.length === 0) continue;
            
            // Handle commands
            const shouldContinue = await handleCommand(userInput, commands);
            if (!shouldContinue) break;
            
            // If it was a command, skip agent processing
            if (userInput.startsWith("/")) continue;

            let wroteAnyChunk = false;
            const result = await agentLoop.runTurn(userInput, {
                onModelRequestStart: () =>
                {
                    generationIndicator.start();
                },
                onModelRequestDone: () =>
                {
                    generationIndicator.stop();
                },
                onAssistantChunk: (chunk) =>
                {
                    generationIndicator.stop();
                    if (!wroteAnyChunk)
                    {
                        output.write("\n");
                        wroteAnyChunk = true;
                    }

                    output.write(renderMarkdown(chunk));
                },
                onToolStart: (toolName) =>
                {
                    generationIndicator.stop();
                    output.write(`\n${colors.yellow(getToolProgressMessage(toolName))}\n`);
                },
                onToolDone: (toolName, toolResult) =>
                {
                    const marker = toolResult.ok ? colors.green("ok=true") : colors.red("ok=false");
                    output.write(`${colors.dim("[tool]")} ${colors.cyan(toolName)} ${marker}\n`);
                },
            });

            if (!wroteAnyChunk && result.assistantText.length > 0)
            {
                output.write(`\n${renderMarkdown(result.assistantText)}`);
            }
            output.write("\n\n");
        }
    }
    finally
    {
        input.off("keypress", onKeypress);
        generationIndicator.stop();
        rl.close();
    }
}
