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
    createStoredSessionId,
    deriveSessionTitle,
    getSessionsDirectory,
    listStoredSessions,
    loadStoredSession,
    saveStoredSession,
} from "@/cli/session-store";
import {
    getFirstEnvValue,
    getRuntimeConfigPath,
    loadRuntimeConfig,
    promptForToken,
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
import type { AskUserFn } from "@/tools/types";
import { createVariableProcessor } from "@/variables";
import { ensureValidToken } from "@/cli/auth-flow";
import { createAuthActions } from "@/cli/auth-flow";
import { createInputQueue } from "@/cli/input-queue";
import { createSidechatRunner } from "@/cli/sidechat";

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
    const initialToken = envToken ?? loadedRuntimeConfig.config.token ?? await promptForToken();
    const token = await ensureValidToken({
        initialToken,
        envToken,
        savedToken: loadedRuntimeConfig.config.token,
        runtimeConfigPath,
    });

    let deepseekClient = new DeepseekClient(token);
    await deepseekClient.initialize();
    let session = await deepseekClient.createSession();

    const prompts = await readPromptFiles();
    const variableProcessor = createVariableProcessor({ workspaceRoot: process.cwd() });
    const contextManager = new ContextManager(
        prompts.basePrompt,
        prompts.toolsPrompt,
        { maxMessages: 40 },
        variableProcessor,
    );
    const sessionsDir = getSessionsDirectory();
    let currentLocalSession = {
        id: createStoredSessionId(),
        createdAt: new Date().toISOString(),
    };
    const saveCurrentLocalSession = async (): Promise<void> =>
    {
        await saveStoredSession(sessionsDir, {
            id: currentLocalSession.id,
            createdAt: currentLocalSession.createdAt,
            workspaceRoot: process.cwd(),
            modelType,
            context: contextManager.exportState(),
        });
    };
    const startNewLocalSession = (): void =>
    {
        currentLocalSession = {
            id: createStoredSessionId(),
            createdAt: new Date().toISOString(),
        };
    };
    const resetMainSession = async (): Promise<void> =>
    {
        session = await deepseekClient.createSession();
        contextManager.markSessionReset();
    };
    let askUserImpl: AskUserFn = () => Promise.resolve(null);
    const toolExecutor = new ToolExecutor(process.cwd(), (req) => askUserImpl(req));
    let modelType: ModelType = "default";
    const agentLoop = new AgentLoop(() => deepseekClient, () => session, contextManager, toolExecutor, {
        maxStepsPerTurn: 12,
        getModelType: () => modelType,
    });

    const terminalInput = createTerminalInput({ getWorkspaceRoot: () => process.cwd() });
    const generationIndicator = createGenerationIndicator(output);
    const colorMode = getColorMode();
    const terminalCapabilities = getTerminalCapabilities();

    // --- Input queue ---

    const inputQueue = createInputQueue((size) =>
    {
        terminalInput.setQueueSize(size);
        generationIndicator.setQueueSize(size);
    });

    // --- Output helpers ---

    let isMainTurnActive = false;

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

    const formatSessionDate = (value: string): string =>
    {
        const parsed = new Date(value);
        if (Number.isNaN(parsed.getTime())) return value;
        return parsed.toLocaleString("ru-RU", {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
        });
    };

    // --- Interactive user prompts ---

    askUserImpl = async (request) =>
    {
        generationIndicator.stop();
        terminalInput.setRenderEnabled(true);
        terminalInput.setMode("active");

        try
        {
            if (request.type === "text")
            {
                output.write(`\n${colors.cyan("?")} ${request.prompt}\n`);
                return await inputQueue.waitForNext();
            }

            if (request.type === "confirm")
            {
                return await terminalInput.choose(request.question, [
                    { value: "yes", label: "Да" },
                    { value: "no", label: "Нет" },
                ]);
            }

            if (request.type === "choice")
            {
                const items = [
                    ...request.options.map((o) => ({ value: o, label: o })),
                    { value: "__custom__", label: colors.dim("Свой вариант...") },
                ];
                const selected = await terminalInput.choose(request.title, items);
                if (selected === "__custom__")
                {
                    output.write(`\n${colors.cyan("?")} Введите свой вариант:\n`);
                    return await inputQueue.waitForNext();
                }
                return selected;
            }

            return null;
        }
        finally
        {
            terminalInput.setMode("queue");
            terminalInput.setRenderEnabled(false);
        }
    };

    // --- Auth actions ---

    const { relogin, logout } = createAuthActions({
        runtimeConfigPath,
        contextManager,
        waitForInput: () => inputQueue.waitForNext(),
        writeOutput: writeDetachedOutput,
        startNewLocalSession,
        onReloggedIn: (newClient, newSession) =>
        {
            deepseekClient = newClient;
            session = newSession;
        },
    });

    // --- Sidechat ---

    const { runSidechat, startQueuedSidechat, pendingTasks: pendingSidechatTasks } = createSidechatRunner({
        getClient: () => deepseekClient,
        getModelType: () => modelType,
        getWorkspaceRoot: () => process.cwd(),
        prompts,
        variableProcessor,
        generationIndicator,
        getAskUser: () => askUserImpl,
        writeDetachedOutput,
        setRenderEnabled: (enabled) => terminalInput.setRenderEnabled(enabled),
    });

    // --- Command handlers ---

    let commands = new Map<string, Command>();
    commands = createCommandHandlers(terminalInput, {
        getSessionInfo: () => [
            `Remote session ID: ${session.getId()}`,
            `Local session ID: ${currentLocalSession.id}`,
        ].join(" | "),
        getContextStats: () => [
            `Messages in local context: ${contextManager.getMessageCount()}`,
            `Approx tokens since refresh: ${contextManager.getApproxTokensSinceRefresh()}/${contextManager.getRefreshEveryApproxTokens()}`,
            `Bootstrap pending: ${contextManager.isBootstrapPending() ? "yes" : "no"}`,
        ].join(" | "),
        clearHistory: async () =>
        {
            contextManager.clearHistory();
            startNewLocalSession();
            await resetMainSession();
            await saveCurrentLocalSession();
        },
        openSessions: async () =>
        {
            const sessions = await listStoredSessions(sessionsDir);
            if (sessions.length === 0)
            {
                return { loaded: false };
            }

            const selectedId = await terminalInput.choose(
                "Сохраненные сессии",
                sessions.map((item) => ({
                    value: item.id,
                    label: `${formatSessionDate(item.updatedAt)} | ${item.title}`,
                    hint: `${item.messageCount} сообщений | ${item.modelType} | ${item.workspaceRoot}`,
                })),
            );

            if (!selectedId)
            {
                return { loaded: false, cancelled: true };
            }

            const snapshot = await loadStoredSession(sessionsDir, selectedId);
            if (!snapshot)
            {
                return { loaded: false };
            }

            currentLocalSession = {
                id: snapshot.id,
                createdAt: snapshot.createdAt,
            };
            modelType = snapshot.modelType;
            contextManager.restoreState(snapshot.context);
            await resetMainSession();
            await saveCurrentLocalSession();

            const title = sessions.find((item) => item.id === snapshot.id)?.title ?? "без названия";
            return { loaded: true, title };
        },
        getTheme: () => getColorMode().theme,
        setTheme: (theme) => setTheme(theme),
        getModelType: () => modelType,
        setModelType: (nextModelType) => modelType = nextModelType,
        runSidechat,
        confirm: (message) => terminalInput.confirm(message),
        resolveSessionForLoad: async (id) =>
        {
            // 1. Check local sessions first
            const localSnapshot = await loadStoredSession(sessionsDir, id);
            if (localSnapshot)
            {
                const title = deriveSessionTitle(localSnapshot.context);
                const messageCount = localSnapshot.context.messages.length;
                return {
                    type: "local" as const,
                    title,
                    messageCount,
                    load: async () =>
                    {
                        currentLocalSession = {
                            id: localSnapshot.id,
                            createdAt: localSnapshot.createdAt,
                        };
                        modelType = localSnapshot.modelType;
                        contextManager.restoreState(localSnapshot.context);
                        await resetMainSession();
                        await saveCurrentLocalSession();
                        return {};
                    },
                };
            }

            // 2. Try as a DeepSeek (global) session
            try
            {
                const historyData = await deepseekClient.fetchHistory(id);
                const { chat_session, chat_messages } = historyData;

                const messageMap = new Map(
                    chat_messages.map((msg) => [msg.message_id, msg]),
                );
                const chain: typeof chat_messages = [];
                let currentId: number | null = chat_session.current_message_id;
                while (currentId !== null)
                {
                    const msg = messageMap.get(currentId);
                    if (!msg) break;
                    chain.unshift(msg);
                    currentId = msg.parent_id;
                }

                const localMessages: Array<{ role: "user" | "assistant"; content: string }> = [];
                for (const msg of chain)
                {
                    if (msg.status !== "FINISHED") continue;
                    const role = msg.role === "USER" ? "user" : msg.role === "ASSISTANT" ? "assistant" : null;
                    if (!role) continue;
                    const contentType = role === "user" ? "REQUEST" : "RESPONSE";
                    const content = msg.fragments
                        .filter((f) => f.type === contentType)
                        .map((f) => f.content)
                        .join("\n")
                        .trim();
                    if (content.length > 0) localMessages.push({ role, content });
                }

                const lastMsg = chain[chain.length - 1];
                const parentMessageId = lastMsg?.message_id ?? null;

                return {
                    type: "global" as const,
                    title: chat_session.title || id,
                    messageCount: localMessages.length,
                    load: async () =>
                    {
                        if (localMessages.length === 0)
                        {
                            return { error: "история пуста или не содержит завершённых сообщений" };
                        }
                        contextManager.restoreState({ messages: localMessages });
                        session = deepseekClient.loadExistingSession(id, parentMessageId);
                        startNewLocalSession();
                        await saveCurrentLocalSession();
                        return {};
                    },
                };
            }
            catch
            {
                return null;
            }
        },
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
            await resetMainSession();
            await saveCurrentLocalSession();
            return {
                before,
                after: contextManager.getMessageCount(),
                summaryChars: summary.length,
            };
        },
        logout,
        relogin,
    });

    // --- Terminal input callbacks ---

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

    const parseBtwQuestion = (value: string): string | null =>
    {
        const trimmed = value.trim();
        const match = trimmed.match(/^\/btw(?:\s+([\s\S]+))?$/i);
        if (!match) return null;
        const question = match[1]?.trim() ?? "";
        return question.length > 0 ? question : "";
    };

    terminalInput.onSubmit((value) =>
    {
        if (!value) return;
        if (inputQueue.hasPendingWaiter())
        {
            inputQueue.resolveWaiter(value);
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

            inputQueue.enqueue(value);
        }
    });

    // --- Welcome message ---

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

    // --- Main loop ---

    try
    {
        while (true)
        {
            terminalInput.setMode("active");

            const userInput = await inputQueue.waitForNext();
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
                await saveCurrentLocalSession();
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
                    const item = inputQueue.itemAt(i) ?? "";
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
