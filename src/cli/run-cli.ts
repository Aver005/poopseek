import { stdout as output } from "node:process";
import ContextManager from "@/agent/context-manager";
import StreamingAgentLoop from "@/agent/streaming-loop";
import ToolExecutor from "@/agent/tool-executor";
import { colors, getColorMode } from "@/cli/colors";
import {
    getFileAttachmentPreviewLines,
    prepareInputWithFileMentions,
} from "@/cli/file-mentions";
import { createGenerationIndicator } from "@/cli/generation-indicator";
import { renderMarkdown } from "@/cli/markdown";
import { readPromptFiles } from "@/cli/prompt-files";
import {
    createStoredSessionId,
    getSessionsDirectory,
    saveStoredSession,
} from "@/cli/session-store";
import {
    getFirstEnvValue,
    getRuntimeConfigPath,
    loadRuntimeConfig,
    promptForToken,
    saveRuntimeConfig,
} from "@/cli/runtime-config";
import {
    adaptTextToTerminal,
    getTerminalCapabilities,
} from "@/cli/terminal-capabilities";
import { createTerminalInput } from "@/cli/terminal-input";
import { getToolDetail, getToolProgressMessage, renderToolResultExtra } from "@/cli/tool-progress-messages";
import { handleCommand } from "@/commands";
import { buildCommandHandlers } from "@/commands/handlers";
import type { AskUserFn } from "@/tools/types";
import { createVariableProcessor } from "@/variables";
import { SkillManager } from "@/skills";
import { loadRoleContent } from "@/roles";
import { MCPManager, loadMCPConfig } from "@/mcp";
import { loadSkillFolders } from "@/skills/skill-folders-store";
import { ensureValidToken } from "@/cli/auth-flow";
import { createAuthActions } from "@/cli/auth-flow";
import { createInputQueue } from "@/cli/input-queue";
import { createSidechatRunner } from "@/cli/sidechat";
import { SubAgentRunner } from "@/agent/sub-agent";
import { createReviewRunner } from "@/cli/review";
import { createRefactorRunner } from "@/cli/refactor";
import { LoadingView } from "@/cli/views/loading";
import { runOnboarding } from "@/cli/onboarding";
import {
    createProvider,
    DeepseekWebProvider,
    type ILLMProvider,
} from "@/providers";
import { runRoleCreation, type ActiveOperation } from "@/roles/creation";
import { createDeepseekHistoryImporter } from "@/deepseek-client/history-import";

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

    // --- Onboarding (first launch) ---

    let runtimeConfig = loadedRuntimeConfig.config;

    if (!runtimeConfig.onboardingDone)
    {
        const result = await runOnboarding(runtimeConfig, runtimeConfigPath);
        runtimeConfig = {
            ...runtimeConfig,
            userName: result.userName,
            configuredProviders: result.configuredProviders,
            provider: result.activeProvider,
            token: result.token,
            onboardingDone: true,
        };
        await saveRuntimeConfig(runtimeConfigPath, runtimeConfig);
    }

    // --- Provider initialization ---

    let provider: ILLMProvider;
    let token: string = runtimeConfig.token ?? "";

    const savedProviderConfig = runtimeConfig.provider;

    if (savedProviderConfig && savedProviderConfig.id !== "deepseek-web")
    {
        provider = await createProvider(savedProviderConfig, "");
    }
    else
    {
        const initialToken = envToken ?? runtimeConfig.token ?? await promptForToken();
        token = await ensureValidToken({
            initialToken,
            envToken,
            savedToken: runtimeConfig.token,
            runtimeConfigPath,
            baseConfig: runtimeConfig,
        });
        provider = await DeepseekWebProvider.create(token);
    }

    let userNameForContext = runtimeConfig.userName;
    let configuredProviders = runtimeConfig.configuredProviders;

    const terminalInput = createTerminalInput({ getWorkspaceRoot: () => process.cwd() });
    const generationIndicator = createGenerationIndicator(output);
    const colorMode = getColorMode();
    const terminalCapabilities = getTerminalCapabilities();

    const loadingView = new LoadingView([
        "Воруем ваш токен",
        "Сливаем кодовую базу",
        "Сканируем окружение",
        "Ищем куда ещё залезть",
        "Подключаем троян",
        "Инициализируем сеть",
        "Подготовка к запуску",
        "Загружаем плагины",
        "Запуск модулей",
        "Готово!",
        "Обнуляем переменные",
        "Стираем логи",
        "Оптимизируем память",
        "Растягиваем процессор",
        "Собираем мусор",
        "Перепрыгиваем через баги",
        "Обновляем тайм-ауты",
        "Насаждаем эвенты",
        "Укладываем в кэш",
        "Готово к работе",
    ]);
    await terminalInput.viewManager.push(loadingView);
    terminalInput.viewManager.renderNow();
    const reportProgress = loadingView.getProgressReporter();
    reportProgress?.(20);

    const prompts = await readPromptFiles();
    const variableProcessor = createVariableProcessor({
        workspaceRoot: process.cwd(),
        get userName() { return userNameForContext; },
    });
    const contextManager = new ContextManager(
        prompts.basePrompt,
        prompts.toolsPrompt,
        { maxMessages: 40 },
        variableProcessor,
    );
    reportProgress?.(40);

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
            modelType: modelVariant,
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
    const resetMainProvider = async (): Promise<void> =>
    {
        await provider.reset();
        contextManager.markSessionReset();
    };

    const skillManager = new SkillManager();
    const savedSkillFolders = await loadSkillFolders();
    skillManager.setExtraFolders(savedSkillFolders);
    skillManager.discover(process.cwd());
    reportProgress?.(55);

    // --- MCP ---

    const mcpManager = new MCPManager();
    const mcpConfig = loadMCPConfig(process.cwd());

    const syncMCP = async (): Promise<void> =>
    {
        contextManager.setMCPToolsDoc(mcpManager.generateToolsDoc());
        const resourcesCtx = await mcpManager.buildResourcesContext().catch(() => "");
        contextManager.setMCPResourcesContext(resourcesCtx);
        skillManager.setExternalSkills(mcpManager.getPromptsAsSkills());
    };

    await mcpManager.initialize(mcpConfig.servers, mcpConfig.disabled);
    reportProgress?.(70);
    await syncMCP();
    reportProgress?.(80);

    if (mcpManager.getServerCount() > 0)
    {
        const connectedCount = mcpManager.getServerStatuses().filter((s) => s.status === "connected").length;
        output.write(`\nMCP: ${connectedCount}/${mcpManager.getServerCount()} серверов подключено\n`);
    }

    const syncSkills = (): void => contextManager.setSkillsContent(skillManager.getActiveContent());

    let activeRoleName: string | null = null;
    const syncRole = (): void =>
    {
        if (activeRoleName)
        {
            const content = loadRoleContent(activeRoleName);
            contextManager.setRoleContent(content ?? "");
        }
        else
        {
            contextManager.setRoleContent("");
        }
    };

    const buildAvailableSkillsHint = (): string =>
    {
        const all = skillManager.getSkills();
        if (all.length === 0) return "";
        const namesList = all.map((s) => s.name).join(", ");
        const exampleName = all[0]!.name;
        return [
            `Навыки: ${namesList}`,
            "",
            "Получить полное содержимое навыка:",
            "```json",
            `{"tool": "skill.read", "args": {"name": "${exampleName}"}}`,
            "```",
        ].join("\n");
    };

    const syncAvailableSkills = (): void =>
        contextManager.setAvailableSkillsHint(buildAvailableSkillsHint());

    syncAvailableSkills();

    let askUserImpl: AskUserFn = () => Promise.resolve(null);
    const subAgentRunner = new SubAgentRunner(
        () => provider,
        process.cwd(),
    );
    const toolExecutor = new ToolExecutor(
        process.cwd(),
        (req) => askUserImpl(req),
        (skillName) =>
        {
            const skill = skillManager.getSkills().find((s) => s.name === skillName);
            return skill ? skill.body : null;
        },
        mcpManager.createDynamicToolResolver(),
        () => mcpManager.getDynamicToolNames(),
        subAgentRunner,
        (message) => generationIndicator.activate(message),
    );
    reportProgress?.(95);

    let modelVariant = "default";
    let searchEnabled = false;
    let thinkingEnabled = false;

    const getCallOptions = () => ({
        modelVariant,
        searchEnabled,
        thinkingEnabled,
    });

    const agentLoop = new StreamingAgentLoop(() => provider, contextManager, toolExecutor, {
        getCallOptions,
    });

    // Pop loading view
    reportProgress?.(100);
    await terminalInput.viewManager.pop();

    // --- Shared mutable refs (accessed from role creation and command handlers) ---

    const isRoleCreationActiveRef = { current: false };
    const isMainTurnActiveRef = { current: false };
    const activeOperationRef = { current: null as ActiveOperation | null };
    const activeInterruptControllerRef = { current: null as AbortController | null };

    terminalInput.setStatusLine(() =>
    {
        const isDeepseekWeb = provider.info.id === "deepseek-web";
        const label = isDeepseekWeb ? `${provider.info.label} · ${modelVariant}` : provider.info.label;
        const parts: string[] = [colors.magenta(label)];
        if (isRoleCreationActiveRef.current)
        {
            parts.push(colors.yellow("сценарий: Создание роли"));
            return colors.dim("◆ ") + parts.join(colors.dim(" · "));
        }
        const messageCount = contextManager.getMessageCount();
        parts.push(colors.dim(`${messageCount} msg`));
        if (searchEnabled) parts.push(colors.green("web"));
        if (thinkingEnabled) parts.push(colors.cyan("think"));
        const activeSkillsCount = skillManager.getActiveNames().length;
        if (activeSkillsCount > 0) parts.push(colors.yellow(`${activeSkillsCount} skills`));
        if (activeRoleName) parts.push(colors.cyan(`role:${activeRoleName}`));
        return colors.dim("◆ ") + parts.join(colors.dim(" · "));
    });

    // --- Input queue ---

    const inputQueue = createInputQueue((size) =>
    {
        terminalInput.setQueueSize(size);
        generationIndicator.setQueueSize(size);
    });

    const waitForVisibleInput = async (): Promise<string> =>
    {
        terminalInput.setMode("active");
        terminalInput.setRenderEnabled(true);
        return await inputQueue.waitForNext();
    };

    // --- Output helpers ---

    const writeDetachedOutput = (value: string): void =>
    {
        const shouldRestoreRender = !isMainTurnActiveRef.current;
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
        waitForInput: waitForVisibleInput,
        writeOutput: writeDetachedOutput,
        startNewLocalSession,
        onReloggedIn: (newProvider) =>
        {
            provider = newProvider;
        },
        getRuntimeConfig: () => runtimeConfig,
    });

    // --- Sidechat ---

    const { runSidechat, startQueuedSidechat, pendingTasks: pendingSidechatTasks } = createSidechatRunner({
        getProvider: () => provider,
        getCallOptions,
        getWorkspaceRoot: () => process.cwd(),
        prompts,
        variableProcessor,
        generationIndicator,
        getAskUser: () => askUserImpl,
        writeDetachedOutput,
        setRenderEnabled: (enabled) => terminalInput.setRenderEnabled(enabled),
    });

    const { runReview } = createReviewRunner({
        getProvider: () => provider,
        getCallOptions,
        getWorkspaceRoot: () => process.cwd(),
        reviewPrompt: prompts.reviewPrompt,
        toolsPrompt: prompts.toolsPrompt,
        variableProcessor,
        generationIndicator,
        getAskUser: () => askUserImpl,
        setRenderEnabled: (enabled) => terminalInput.setRenderEnabled(enabled),
    });

    const { runRefactor } = createRefactorRunner({
        getProvider: () => provider,
        getCallOptions,
        getWorkspaceRoot: () => process.cwd(),
        refactorPrompt: prompts.refactorPrompt,
        toolsPrompt: prompts.toolsPrompt,
        variableProcessor,
        generationIndicator,
        getAskUser: () => askUserImpl,
        setRenderEnabled: (enabled) => terminalInput.setRenderEnabled(enabled),
    });

    // --- Active operation cancel ---

    const cancelActiveOperation = (): boolean =>
    {
        if (!activeOperationRef.current) return false;
        const currentOperation = activeOperationRef.current;
        activeOperationRef.current = null;
        if (!currentOperation.abortController.signal.aborted)
        {
            currentOperation.abortController.abort(new Error("Создание роли прервано."));
        }
        if (inputQueue.hasPendingWaiter())
        {
            inputQueue.resolveWaiter("/back");
        }
        generationIndicator.stop();
        return true;
    };

    // --- Command handlers ---

    let activeInterruptCommand: ((error: Error) => void) | null = null;

    const commands = buildCommandHandlers(terminalInput, {
        getProvider: () => provider,
        setProvider: (p) => { provider = p; },
        contextManager,
        sessionsDir,
        getCurrentLocalSession: () => currentLocalSession,
        setCurrentLocalSession: (s) => { currentLocalSession = s; },
        getModelVariant: () => modelVariant,
        setModelVariant: (v) => { modelVariant = v; },
        startNewLocalSession,
        resetMainProvider,
        saveCurrentLocalSession,
        runtimeConfigPath,
        getRuntimeConfig: () => runtimeConfig,
        setRuntimeConfig: (c) => { runtimeConfig = c; },
        getToken: () => token,
        getUserName: () => userNameForContext,
        setUserName: (n) => { userNameForContext = n; },
        getConfiguredProviders: () => configuredProviders,
        setConfiguredProviders: (ps) => { configuredProviders = ps; },
        activeInterruptControllerRef,
        skillManager,
        mcpManager,
        syncMCP,
        syncSkills,
        syncAvailableSkills,
        getActiveRoleName: () => activeRoleName,
        setActiveRoleName: (name) => { activeRoleName = name; },
        syncRole,
        viewManager: terminalInput.viewManager,
        choose: (title, items) => terminalInput.choose(title, items),
        confirm: (message) => terminalInput.confirm(message),
        waitForInput: waitForVisibleInput,
        runSidechat,
        runReview,
        runRefactor,
        logout,
        relogin,
        getSearchEnabled: () => searchEnabled,
        setSearchEnabled: (enabled) => { searchEnabled = enabled; },
        getThinkingEnabled: () => thinkingEnabled,
        setThinkingEnabled: (enabled) => { thinkingEnabled = enabled; },
        createRole: () => runRoleCreation({
            getProvider: () => provider,
            prompts,
            variableProcessor,
            skillManager,
            mcpManager,
            subAgentRunner,
            inputQueue,
            generationIndicator,
            terminalInput,
            getCallOptions,
            isRoleCreationActiveRef,
            isMainTurnActiveRef,
            activeOperationRef,
        }),
        cancelActiveOperation,
        prompts,
        variableProcessor,
        getRemoteSessionImporter: () => provider instanceof DeepseekWebProvider
            ? createDeepseekHistoryImporter(provider)
            : undefined,
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
        onInterrupt: () =>
        {
            if (cancelActiveOperation())
            {
                output.write(`\n${colors.yellow("Создание роли прервано.")}\n\n`);
            }
            activeInterruptControllerRef.current?.abort("user-interrupt");
            activeInterruptControllerRef.current = null;
            activeInterruptCommand?.(new Error("Операция прервана (Ctrl+C)"));
            activeInterruptCommand = null;
        },
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
        if (activeOperationRef.current?.kind === "role-creation")
        {
            const trimmed = value.trim().toLowerCase();
            if (trimmed === "/back")
            {
                cancelActiveOperation();
                writeDetachedOutput(`\n${colors.yellow("Создание роли прервано.")}\n\n`);
                return;
            }
            if (trimmed.startsWith("/"))
            {
                writeDetachedOutput(`\n${colors.dim("Во время создания роли доступна только команда /back.")}\n\n`);
                return;
            }
        }
        if (inputQueue.hasPendingWaiter())
        {
            inputQueue.resolveWaiter(value);
            return;
        }
        if (!value) return;
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
    output.write(`Провайдер: ${colors.magenta(provider.info.label)}\n`);
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

            if (userInput.startsWith("/"))
            {
                terminalInput.setMode("active");
                terminalInput.setRenderEnabled(true);
            }

            const shouldContinue = await (async (): Promise<boolean> =>
            {
                let settled = false;
                const interruptPromise = new Promise<never>((_, reject) =>
                {
                    activeInterruptCommand = (error: Error) =>
                    {
                        if (settled) return;
                        settled = true;
                        reject(error);
                    };
                });
                try
                {
                    const commandPromise = handleCommand(userInput, commands).then((value) =>
                    {
                        settled = true;
                        return value;
                    });
                    return await Promise.race([commandPromise, interruptPromise]);
                }
                catch (error)
                {
                    const message = error instanceof Error ? error.message : String(error);
                    output.write(`\n${colors.red(message)}\n\n`);
                    return true;
                }
                finally
                {
                    activeInterruptCommand = null;
                }
            })();
            if (!shouldContinue) break;
            if (userInput.startsWith("/"))
            {
                terminalInput.setRenderEnabled(true);
                continue;
            }

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
            let hadToolInThisTurn = false;
            isMainTurnActiveRef.current = true;
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
                            if (hadToolInThisTurn)
                            {
                                output.write("\n" + colors.dim("─".repeat(48)) + "\n");
                            }
                            else
                            {
                                output.write("\n");
                            }
                            wroteAnyChunk = true;
                        }
                        output.write(renderMarkdown(chunk));
                    },
                    onToolStart: (toolName, toolArgs) =>
                    {
                        generationIndicator.stop();
                        const detail = getToolDetail(toolName, toolArgs);
                        const suffix = detail ? ` ${colors.dim(`(${detail})`)}` : "";
                        output.write(`${colors.yellow(getToolProgressMessage(toolName))}${suffix}\n`);
                    },
                    onToolDone: (toolName, toolResult) =>
                    {
                        generationIndicator.stop();
                        hadToolInThisTurn = true;
                        wroteAnyChunk = false;
                        const marker = toolResult.ok ? colors.green("ok") : colors.red("not ok");
                        output.write(`${colors.dim("[tool]")} ${colors.cyan(toolName)} ${marker}\n`);
                        if (toolResult.ok)
                        {
                            const extra = renderToolResultExtra(toolName, toolResult.data);
                            if (extra) output.write(extra);
                        }
                        output.write("\n");
                        generationIndicator.activate("Продолжаю...");
                    },
                    onToolParseError: (content) =>
                    {
                        generationIndicator.stop();
                        output.write(`\n${colors.red("[tool parse error]")} Не удалось распарсить вызов инструмента\n`);
                        const preview = content.slice(0, 300);
                        output.write(`${colors.dim(preview)}\n\n`);
                    },
                });
                await saveCurrentLocalSession();
            }
            finally
            {
                isMainTurnActiveRef.current = false;
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
