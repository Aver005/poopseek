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
import { getToolDetail, getToolProgressMessage } from "@/cli/tool-progress-messages";
import {
    createCommandHandlers,
    handleCommand,
} from "@/commands";
import type { Command } from "@/commands/types";
import DeepseekClient from "@/deepseek-client/client/DeepseekClient";
import type { ModelType } from "@/deepseek-client/types";
import { createVariableProcessor } from "@/variables";

declare const __APP_VERSION__: string | undefined;

export async function runCli(): Promise<void>
{
    const runtimeConfigPath = getRuntimeConfigPath();
    const loadedRuntimeConfig = await loadRuntimeConfig(runtimeConfigPath);
    const envToken = getFirstEnvValue(["DEEPSEEK_TOKEN"]);
    const envVersion = getFirstEnvValue(["POOPSEEK_VERSION", "APP_VERSION"]);
    const embeddedVersion = typeof __APP_VERSION__ === "string"
        ? __APP_VERSION__.trim()
        : "";
    const appVersion = embeddedVersion || envVersion || "dev";
    const configToken = loadedRuntimeConfig.config.token;
    const token = envToken
        ?? configToken
        ?? await promptForToken();

    const nextRuntimeConfig: RuntimeConfig = { token };
    const shouldUpdateRuntimeConfig = !loadedRuntimeConfig.exists
        || loadedRuntimeConfig.config.token !== nextRuntimeConfig.token;

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
    const pendingSidechatTasks = new Set<Promise<void>>();
    let resolveNextInput: ((value: string) => void) | null = null;
    let isMainTurnActive = false;

    const syncQueueState = (): void =>
    {
        const queueSize = inputQueue.length;
        terminalInput.setQueueSize(queueSize);
        generationIndicator.setQueueSize(queueSize);
    };

    const writeDetachedOutput = (value: string): void =>
    {
        const shouldRestoreRender = !isMainTurnActive;
        if (shouldRestoreRender) terminalInput.setRenderEnabled(false);
        output.write(value);
        if (shouldRestoreRender) terminalInput.setRenderEnabled(true);
    };

    const writeUserMessage = (value: string): void =>
    {
        const lines = value.split("\n");
        output.write("\n");
        for (let i = 0; i < lines.length; i += 1)
        {
            const line = lines[i] ?? "";
            const prefix = i === 0 ? colors.magenta(">") : colors.dim("|");
            output.write(`${prefix} ${line}\n`);
        }
    };

    const parseBtwQuestion = (value: string): string | null =>
    {
        const trimmed = value.trim();
        const match = trimmed.match(/^\/btw(?:\s+([\s\S]+))?$/i);
        if (!match) return null;
        const question = match[1]?.trim() ?? "";
        return question.length > 0 ? question : "";
    };

    const waitForInput = (): Promise<string> =>
    {
        if (inputQueue.length > 0)
        {
            const value = inputQueue.shift()!;
            syncQueueState();
            return Promise.resolve(value);
        }
        return new Promise((resolve) =>
        {
            resolveNextInput = resolve;
        });
    };

    const executeSidechat = async (
        question: string,
        options: {
            buffered?: boolean;
            showHeader?: boolean;
            useIndicator?: boolean;
        } = {},
    ): Promise<void> =>
    {
        const buffered = options.buffered ?? false;
        const showHeader = options.showHeader ?? true;
        const useIndicator = options.useIndicator ?? true;
        const chunks: string[] = [];
        const write = (value: string): void =>
        {
            if (buffered) chunks.push(value);
            else output.write(value);
        };
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

        if (showHeader)
        {
            write(`\n${colors.cyan("◈ btw")} ${colors.dim("—")} ${question}\n`);
        }

        try
        {
            let wroteAnyChunk = false;
            await sideLoop.runTurn(question, {
                onModelRequestStart: () =>
                {
                    if (useIndicator) generationIndicator.start();
                },
                onModelRequestDone: () =>
                {
                    if (useIndicator) generationIndicator.stop();
                },
                onAssistantChunk: (chunk) =>
                {
                    if (useIndicator) generationIndicator.stop();
                    if (!wroteAnyChunk)
                    {
                        write("\n");
                        wroteAnyChunk = true;
                    }
                    write(renderMarkdown(chunk));
                },
                onToolStart: (toolName, toolArgs) =>
                {
                    if (useIndicator) generationIndicator.stop();
                    const detail = getToolDetail(toolName, toolArgs);
                    const suffix = detail ? ` ${colors.dim(`(${detail})`)}` : "";
                    write(`\n${colors.yellow(getToolProgressMessage(toolName))}${suffix}\n`);
                },
                onToolDone: (toolName, toolResult) =>
                {
                    const marker = toolResult.ok ? colors.green("ok=true") : colors.red("ok=false");
                    write(`${colors.dim("[btw/tool]")} ${colors.cyan(toolName)} ${marker}\n`);
                },
            });
            write("\n\n");
        }
        catch
        {
            if (useIndicator) generationIndicator.stop();
            write(`${colors.red("btw: ошибка запроса")}\n\n`);
        }

        if (buffered && chunks.length > 0)
        {
            writeDetachedOutput(chunks.join(""));
        }
    };

    const runSidechat = async (question: string): Promise<void> =>
    {
        terminalInput.setRenderEnabled(false);
        try
        {
            await executeSidechat(question);
        }
        finally
        {
            terminalInput.setRenderEnabled(true);
        }
    };

    const startQueuedSidechat = (question: string): void =>
    {
        writeDetachedOutput(`\n${colors.cyan("◈ btw")} ${colors.dim("—")} ${question}\n`);
        const task = executeSidechat(question, {
            buffered: true,
            showHeader: false,
            useIndicator: false,
        });
        pendingSidechatTasks.add(task);
        void task.finally(() =>
        {
            pendingSidechatTasks.delete(task);
        });
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
            if (value.length > 0)
            {
                generationIndicator.pause();
            }
            else
            {
                generationIndicator.resume();
            }
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
            const btwQuestion = parseBtwQuestion(value);
            if (btwQuestion !== null)
            {
                if (btwQuestion.length === 0)
                {
                    writeDetachedOutput("\nИспользование: /btw <вопрос>\n\n");
                }
                else
                {
                    startQueuedSidechat(btwQuestion);
                }
                return;
            }

            inputQueue.push(value);
            syncQueueState();
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
            syncQueueState();

            const userInput = await waitForInput();
            if (!userInput) continue;

            const shouldContinue = await handleCommand(userInput, commands);
            if (!shouldContinue) break;
            if (userInput.startsWith("/")) continue;

            const preparedInput = await prepareInputWithFileMentions(userInput, process.cwd());
            const attachmentPreviewLines = getFileAttachmentPreviewLines(preparedInput.attachments);
            terminalInput.setMode("queue");
            terminalInput.setRenderEnabled(false);
            writeUserMessage(userInput);
            if (attachmentPreviewLines.length > 0)
            {
                output.write(`${attachmentPreviewLines.join("\n")}\n`);
            }

            let wroteAnyChunk = false;
            isMainTurnActive = true;
            try
            {
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
                    onToolStart: (toolName, toolArgs) =>
                    {
                        generationIndicator.stop();
                        const detail = getToolDetail(toolName, toolArgs);
                        const suffix = detail ? ` ${colors.dim(`(${detail})`)}` : "";
                        output.write(`\n${colors.yellow(getToolProgressMessage(toolName))}${suffix}\n`);
                    },
                    onToolDone: (toolName, toolResult) =>
                    {
                        const marker = toolResult.ok ? colors.green("ok=true") : colors.red("ok=false");
                        output.write(`${colors.dim("[tool]")} ${colors.cyan(toolName)} ${marker}\n`);
                    },
                });
            }
            finally
            {
                isMainTurnActive = false;
            }

            output.write("\n\n");

            generationIndicator.resume();
            terminalInput.setMode("active");

            if (inputQueue.length > 0)
            {
                output.write(colors.dim(`Очередь (${inputQueue.length}):\n`));
                for (let i = 0; i < inputQueue.length; i++)
                {
                    const item = inputQueue[i] ?? "";
                    const firstLine = item.split("\n")[0] ?? item;
                    const preview = firstLine.length > 100
                        ? `${firstLine.slice(0, 100)}…`
                        : firstLine;
                    output.write(colors.dim(`  ${i + 1}. ${preview}\n`));
                }
                output.write("\n");
            }

            terminalInput.setRenderEnabled(true);
        }
    }
    finally
    {
        await Promise.allSettled(Array.from(pendingSidechatTasks));
        terminalInput.close();
        generationIndicator.stop();
    }
}
