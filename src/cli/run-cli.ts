import fs from "node:fs";
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

function getRequiredEnv(name: string): string
{
    const value = process.env[name];
    if (!value || value.trim().length === 0)
    {
        throw new Error(`Missing required env variable: ${name}`);
    }
    return value.trim();
}

function getOptionalEnv(name: string): string | null
{
    const value = process.env[name];
    if (!value) return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

async function readPromptFiles(): Promise<{
    basePrompt: string;
    toolsPrompt: string;
    compactPrompt: string;
}>
{
    const cwd = process.cwd();
    const basePromptPath = path.resolve(cwd, "assets/prompts/base.prompt.md");
    const compactPromptPath = path.resolve(cwd, "assets/prompts/compact.prompt.md");
    const toolsPromptPath = path.resolve(cwd, "docs/tools/tool.base.md");

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
    const token = getRequiredEnv("DEEPSEEK_TOKEN");
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
    const appVersion =
        getOptionalEnv("POOPSEEK_VERSION") ??
        getOptionalEnv("APP_VERSION") ??
        "dev";

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

                    output.write(chunk);
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
                output.write(`\n${result.assistantText}`);
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
