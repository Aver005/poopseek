import { stdout as output } from "node:process";
import { collectDeepseekOutput } from "@/bridge/deepseek-stream";
import ContextManager from "@/agent/context-manager";
import AgentLoop from "@/agent/loop";
import ToolExecutor from "@/agent/tool-executor";
import { colors, getColorMode, setTheme } from "@/cli/colors";
import {
    getFileAttachmentPreviewLines,
    prepareInputWithFileMentions,
} from "@/cli/file-mentions";
import { createGenerationIndicator } from "@/cli/generation-indicator";
import { renderMarkdown } from "@/cli/markdown";
import { readPromptFiles } from "@/cli/prompt-files";
import {
    getFirstEnvValue,
    getRuntimeConfigPath,
    loadRuntimeConfig,
    promptForToken,
    saveRuntimeConfig,
    type RuntimeConfig,
} from "@/cli/runtime-config";
import {
    adaptTextToTerminal,
    getTerminalCapabilities,
} from "@/cli/terminal-capabilities";
import { createTerminalInput } from "@/cli/terminal-input";
import { getToolProgressMessage } from "@/cli/tool-progress-messages";
import {
    createCommandHandlers,
    handleCommand,
} from "@/commands";
import type { Command } from "@/commands/types";
import DeepseekClient from "@/deepseek-client/client/DeepseekClient";
import type { ModelType } from "@/deepseek-client/types";
import { createVariableProcessor } from "@/variables";

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
    const variableProcessor = createVariableProcessor({ workspaceRoot: process.cwd() });
    const contextManager = new ContextManager(
        prompts.basePrompt,
        prompts.toolsPrompt,
        { maxMessages: 40 },
        variableProcessor,
    );
    const toolExecutor = new ToolExecutor(process.cwd());
    let modelType: ModelType = "default";
    const agentLoop = new AgentLoop(deepseekClient, session, contextManager, toolExecutor, {
        maxStepsPerTurn: 12,
        getModelType: () => modelType,
    });

    const terminalInput = createTerminalInput({ getWorkspaceRoot: () => process.cwd() });
    const generationIndicator = createGenerationIndicator(output);
    const colorMode = getColorMode();
    const terminalCapabilities = getTerminalCapabilities();

    const inputQueue: string[] = [];
    let resolveNextInput: ((value: string) => void) | null = null;

    const waitForInput = (): Promise<string> =>
    {
        if (inputQueue.length > 0)
        {
            const value = inputQueue.shift()!;
            return Promise.resolve(value);
        }
        return new Promise((resolve) =>
        {
            resolveNextInput = resolve;
        });
    };

    const runSidechat = async (question: string): Promise<void> =>
    {
        const sideSession = await deepseekClient.createSession();
        const sideContext = new ContextManager(
            prompts.basePrompt,
            prompts.toolsPrompt,
            { maxMessages: 10 },
            variableProcessor,
        );
        const sideTool = new ToolExecutor(process.cwd());
        const sideLoop = new AgentLoop(deepseekClient, sideSession, sideContext, sideTool, {
            maxStepsPerTurn: 6,
            getModelType: () => modelType,
        });

        output.write(`\n${colors.cyan("◈ btw")} ${colors.dim("—")} ${question}\n`);

        terminalInput.setRenderEnabled(false);
        try
        {
            let wroteAnyChunk = false;
            await sideLoop.runTurn(question, {
                onModelRequestStart: () => { generationIndicator.start(); },
                onModelRequestDone: () => { generationIndicator.stop(); },
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
                    output.write(`${colors.dim("[btw/tool]")} ${colors.cyan(toolName)} ${marker}\n`);
                },
            });
            output.write("\n\n");
        }
        catch
        {
            generationIndicator.stop();
            output.write(`${colors.red("btw: ошибка запроса")}\n\n`);
        }
        finally
        {
            terminalInput.setRenderEnabled(true);
        }
    };

    let commands = new Map<string, Command>();
    commands = createCommandHandlers(terminalInput, {
        getSessionInfo: () => `Session ID: ${session.getId()}`,
        getContextStats: () => `Messages in context: ${contextManager.getMessageCount()}`,
        clearHistory: () => contextManager.clearHistory(),
        getTheme: () => getColorMode().theme,
        setTheme: (theme) => setTheme(theme),
        getModelType: () => modelType,
        setModelType: (nextModelType) => modelType = nextModelType,
        runSidechat,
        compactContext: async () =>
        {
            const before = contextManager.getMessageCount();
            if (before === 0) return null;

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
            if (summary.length === 0) throw new Error("Модель вернула пустую сводку");

            contextManager.replaceWithCompactSummary(summary);
            return {
                before,
                after: contextManager.getMessageCount(),
                summaryChars: summary.length,
            };
        },
    });

    terminalInput.setQueueCallbacks({
        onValueChange: (value) =>
        {
            if (value.length > 0) generationIndicator.pause();
            generationIndicator.setTypingText(value);
        },
        onStop: () => generationIndicator.resume(),
    });

    terminalInput.onSubmit((value) =>
    {
        if (!value) return;
        if (resolveNextInput)
        {
            resolveNextInput(value);
            resolveNextInput = null;
        }
        else
        {
            inputQueue.push(value);
            terminalInput.setQueueSize(inputQueue.length);
        }
    });

    output.write(`\n${colors.green(adaptTextToTerminal("PoopSeek CLI 💩"))} | v${appVersion}\n\n`);
    output.write(`${colors.yellow("/help")} для списка команд\n`);
    output.write(`${colors.yellow("/tools")} для списка инструментов\n\n`);
    output.write(`Модель: ${colors.magenta(modelType)}\n`);
    output.write(`Цвета ${colorMode.enabled ? colors.green("включены") : colors.red("отключены")}\n`);
    output.write(`Профиль терминала: ${colors.cyan(`${terminalCapabilities.shell}/${terminalCapabilities.terminal}`)}\n`);
    output.write(`Рендер: ${colors.cyan(colorMode.support)} | emoji ${terminalCapabilities.emoji ? colors.green("on") : colors.red("off")}\n`);
    output.write(`Тема: ${colors.cyan(colorMode.theme)}\n\n`);
    output.write(`${colors.dim("Многострочный ввод: ") + colors.blue("Shift+Enter") + colors.dim(" или ") + colors.blue("\\n") + colors.dim(" в тексте")}\n`);
    output.write(`${colors.dim("Файлы: ") + colors.blue("@path") + colors.dim(" и ") + colors.blue("Tab") + colors.dim(" для автокомплита")}\n`);
    output.write(`${colors.dim("Очередь: ввод во время генерации добавляется в очередь")}\n\n`);

    terminalInput.start(commands);

    try
    {
        while (true)
        {
            terminalInput.setMode("active");
            terminalInput.setQueueSize(inputQueue.length);

            const userInput = await waitForInput();
            if (!userInput) continue;

            const shouldContinue = await handleCommand(userInput, commands);
            if (!shouldContinue) break;
            if (userInput.startsWith("/")) continue;

            const preparedInput = await prepareInputWithFileMentions(userInput, process.cwd());
            const attachmentPreviewLines = getFileAttachmentPreviewLines(preparedInput.attachments);
            if (attachmentPreviewLines.length > 0)
            {
                output.write(`\n${attachmentPreviewLines.join("\n")}\n`);
            }

            terminalInput.setMode("queue");
            terminalInput.setRenderEnabled(false);

            let wroteAnyChunk = false;
            await agentLoop.runTurn(preparedInput.content, {
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

            output.write("\n\n");

            if (inputQueue.length > 0)
            {
                output.write(colors.dim(`[очередь: ${inputQueue.length}]\n\n`));
            }

            terminalInput.setRenderEnabled(true);
        }
    }
    finally
    {
        terminalInput.close();
        generationIndicator.stop();
    }
}
