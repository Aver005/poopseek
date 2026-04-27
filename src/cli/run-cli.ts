import { stdout as output } from "node:process";
import ContextManager from "@/agent/context-manager";
import StreamingAgentLoop from "@/agent/streaming-loop";
import ToolExecutor from "@/agent/tool-executor";
import { colors, getColorMode, setTheme } from "@/cli/colors";
import
    {
        getFileAttachmentPreviewLines,
        prepareInputWithFileMentions,
    } from "@/cli/file-mentions";
import { createGenerationIndicator } from "@/cli/generation-indicator";
import { renderMarkdown } from "@/cli/markdown";
import { readPromptFiles } from "@/cli/prompt-files";
import
    {
        createStoredSessionId,
        deriveSessionTitle,
        getSessionsDirectory,
        listStoredSessions,
        loadStoredSession,
        saveStoredSession,
    } from "@/cli/session-store";
import
    {
        getFirstEnvValue,
        getRuntimeConfigPath,
        loadRuntimeConfig,
        promptForToken,
        saveRuntimeConfig,
    } from "@/cli/runtime-config";
import
    {
        adaptTextToTerminal,
        getTerminalCapabilities,
    } from "@/cli/terminal-capabilities";
import { createTerminalInput } from "@/cli/terminal-input";
import { getToolDetail, getToolProgressMessage, renderToolResultExtra } from "@/cli/tool-progress-messages";
import
    {
        createCommandHandlers,
        handleCommand,
    } from "@/commands";
import type { Command } from "@/commands/types";
import type { AskUserFn } from "@/tools/types";
import { createVariableProcessor } from "@/variables";
import { SkillManager } from "@/skills";
import { MCPManager, loadMCPConfig } from "@/mcp";
import { loadSkillFolders, saveSkillFolders } from "@/skills/skill-folders-store";
import { ensureValidToken } from "@/cli/auth-flow";
import { createAuthActions } from "@/cli/auth-flow";
import { createInputQueue } from "@/cli/input-queue";
import { createSidechatRunner } from "@/cli/sidechat";
import { SubAgentRunner } from "@/agent/sub-agent";
import { createReviewRunner } from "@/cli/review";
import { createRefactorRunner } from "@/cli/refactor";
import { LoadingView } from "@/cli/views/loading";
import { runOnboarding } from "@/cli/onboarding";
import
    {
        createProvider,
        DeepseekWebProvider,
        type ILLMProvider,
    } from "@/providers";

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

    terminalInput.setStatusLine(() =>
    {
        const isDeepseekWeb = provider.info.id === "deepseek-web";
        const label = isDeepseekWeb ? `${provider.info.label} · ${modelVariant}` : provider.info.label;
        const parts: string[] = [colors.magenta(label)];
        if (searchEnabled) parts.push(colors.green("web"));
        if (thinkingEnabled) parts.push(colors.cyan("think"));
        const activeSkillsCount = skillManager.getActiveNames().length;
        if (activeSkillsCount > 0) parts.push(colors.yellow(`${activeSkillsCount} skills`));
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

    // --- Auth actions (deepseek-web specific) ---

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

    // --- Command handlers ---

    let commands = new Map<string, Command>();
    let activeInterruptController: AbortController | null = null;
    let interruptActiveCommand: ((error: Error) => void) | null = null;
    commands = createCommandHandlers(terminalInput, {
        viewManager: terminalInput.viewManager,
        getSessionInfo: () =>
        {
            const remoteId = provider instanceof DeepseekWebProvider
                ? provider.getSessionId() ?? "—"
                : "—";
            return [
                `Provider: ${provider.info.label}`,
                `Remote session ID: ${remoteId}`,
                `Local session ID: ${currentLocalSession.id}`,
            ].join(" | ");
        },
        getContextStats: () => [
            `Messages in local context: ${contextManager.getMessageCount()}`,
            `Approx tokens since refresh: ${contextManager.getApproxTokensSinceRefresh()}/${contextManager.getRefreshEveryApproxTokens()}`,
            `Bootstrap pending: ${contextManager.isBootstrapPending() ? "yes" : "no"}`,
        ].join(" | "),
        clearHistory: async () =>
        {
            contextManager.clearHistory();
            startNewLocalSession();
            await resetMainProvider();
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

            if (!selectedId) return { loaded: false, cancelled: true };
            const snapshot = await loadStoredSession(sessionsDir, selectedId);
            if (!snapshot) return { loaded: false };

            currentLocalSession = {
                id: snapshot.id,
                createdAt: snapshot.createdAt,
            };
            modelVariant = snapshot.modelType;
            contextManager.restoreState(snapshot.context);
            await resetMainProvider();
            await saveCurrentLocalSession();

            const title = sessions.find((item) => item.id === snapshot.id)?.title ?? "без названия";
            return { loaded: true, title };
        },
        getTheme: () => getColorMode().theme,
        setTheme: (theme) => setTheme(theme),
        getModelType: () => modelVariant as "default" | "expert",
        setModelType: (nextModelType) =>
        {
            modelVariant = nextModelType;
        },
        getSearchEnabled: () => searchEnabled,
        setSearchEnabled: (enabled) => searchEnabled = enabled,
        getThinkingEnabled: () => thinkingEnabled,
        setThinkingEnabled: (enabled) => thinkingEnabled = enabled,
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
                        modelVariant = localSnapshot.modelType;
                        contextManager.restoreState(localSnapshot.context);
                        await resetMainProvider();
                        await saveCurrentLocalSession();
                        return {};
                    },
                };
            }

            // 2. Try as a DeepSeek remote session (only when using deepseek-web)
            if (!(provider instanceof DeepseekWebProvider)) return null;
            const deepseekProvider = provider;

            activeInterruptController = new AbortController();
            const signal = activeInterruptController.signal;
            const assertNotAborted = (): void =>
            {
                if (signal.aborted) throw new Error("Загрузка сессии прервана (Ctrl+C)");
            };
            const yieldControl = async (): Promise<void> =>
            {
                await new Promise<void>((resolve) => setTimeout(resolve, 0));
            };
            let historyData: Awaited<ReturnType<typeof deepseekProvider.fetchHistory>>;
            try
            {
                historyData = await deepseekProvider.fetchHistory(id, signal);
                assertNotAborted();

                const { chat_session, chat_messages } = historyData;

                const messageMap = new Map(
                    chat_messages.map((msg) => [msg.message_id, msg]),
                );
                const chain: typeof chat_messages = [];
                let currentId: number | null = chat_session.current_message_id;
                const visited = new Set<number>();
                let guard = 0;
                while (currentId !== null)
                {
                    if ((guard & 255) === 0)
                    {
                        await yieldControl();
                        assertNotAborted();
                    }
                    if (visited.has(currentId))
                    {
                        throw new Error(`cycle detected in message chain at id=${currentId}`);
                    }
                    visited.add(currentId);
                    guard += 1;
                    if (guard > chat_messages.length + 1)
                    {
                        throw new Error("message chain traversal overflow");
                    }
                    const msg = messageMap.get(currentId);
                    if (!msg) break;
                    chain.unshift(msg);
                    currentId = msg.parent_id;
                }

                const localMessages: Array<{ role: "user" | "assistant"; content: string }> = [];
                const MAX_MESSAGE_CONTENT = 12000;
                const MAX_LOCAL_MESSAGES = 300;
                for (let index = 0; index < chain.length; index += 1)
                {
                    if ((index & 63) === 0)
                    {
                        await yieldControl();
                        assertNotAborted();
                    }
                    const msg = chain[index];
                    if (!msg || msg.status !== "FINISHED") continue;
                    const role = msg.role === "USER" ? "user" : msg.role === "ASSISTANT" ? "assistant" : null;
                    if (!role) continue;
                    const contentType = role === "user" ? "REQUEST" : "RESPONSE";
                    const content = msg.fragments
                        .filter((f) => f.type === contentType)
                        .map((f) => f.content)
                        .join("\n")
                        .trim();
                    if (content.length === 0) continue;
                    if (content.startsWith("### TOOL RESULT:") || content.startsWith("### SYSTEM SNAPSHOT")) continue;
                    const capped = content.length > MAX_MESSAGE_CONTENT
                        ? content.slice(0, MAX_MESSAGE_CONTENT)
                        : content;
                    localMessages.push({ role, content: capped });
                    if (localMessages.length >= MAX_LOCAL_MESSAGES) break;
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
                        deepseekProvider.loadRemoteSession(id, parentMessageId);
                        startNewLocalSession();
                        await saveCurrentLocalSession();
                        return {};
                    },
                };
            }
            finally
            {
                activeInterruptController = null;
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

            const compactProvider = await provider.clone();
            const chunks: string[] = [];
            for await (const chunk of compactProvider.complete(compactPrompt, { modelVariant }))
            {
                chunks.push(chunk);
            }
            const summary = chunks.join("").trim();
            if (summary.length === 0) throw new Error("Модель вернула пустую сводку");

            contextManager.replaceWithCompactSummary(summary);
            await resetMainProvider();
            await saveCurrentLocalSession();
            return {
                before,
                after: contextManager.getMessageCount(),
                summaryChars: summary.length,
            };
        },
        logout,
        relogin,
        choose: (title, items) => terminalInput.choose(title, items),
        getSkills: () => skillManager.getSkills(),
        isSkillActive: (name) => skillManager.isActive(name),
        activateSkill: (name) =>
        {
            const ok = skillManager.activate(name);
            if (ok) syncSkills();
            return ok;
        },
        activateAllSkills: () =>
        {
            skillManager.activateAll();
            syncSkills();
        },
        deactivateSkill: (name) =>
        {
            const ok = skillManager.deactivate(name);
            syncSkills();
            return ok;
        },
        clearSkills: () =>
        {
            skillManager.clearActive();
            syncSkills();
        },
        getSkillFolders: () => skillManager.getExtraFolders(),
        addSkillFolder: async (folder) =>
        {
            skillManager.addExtraFolder(folder);
            skillManager.rediscover();
            syncAvailableSkills();
            await saveSkillFolders(skillManager.getExtraFolders());
        },
        removeSkillFolder: async (folder) =>
        {
            skillManager.removeExtraFolder(folder);
            skillManager.rediscover();
            syncAvailableSkills();
            await saveSkillFolders(skillManager.getExtraFolders());
        },
        resetSkillFolders: async () =>
        {
            skillManager.resetExtraFolders();
            skillManager.rediscover();
            syncAvailableSkills();
            await saveSkillFolders([]);
        },
        getMCPServerStatuses: () => mcpManager.getServerStatuses(),
        getMCPTools: () => mcpManager.getAllTools(),
        getMCPResources: () => mcpManager.getAllResources(),
        getMCPPrompts: () => mcpManager.getAllPrompts(),
        mcpConnect: async (name) =>
        {
            await mcpManager.connectServer(name);
            await syncMCP();
            syncSkills();
            syncAvailableSkills();
        },
        mcpDisconnect: async (name) =>
        {
            await mcpManager.disconnectServer(name);
            await syncMCP();
            syncSkills();
            syncAvailableSkills();
        },
        mcpEnable: async (name) =>
        {
            await mcpManager.enableServer(name);
            await syncMCP();
            syncSkills();
            syncAvailableSkills();
        },
        mcpDisable: async (name) =>
        {
            await mcpManager.disableServer(name);
            await syncMCP();
            syncSkills();
            syncAvailableSkills();
        },
        mcpReload: async () =>
        {
            const freshConfig = loadMCPConfig(process.cwd());
            await mcpManager.reloadAll(freshConfig.servers, freshConfig.disabled);
            await syncMCP();
            syncSkills();
            syncAvailableSkills();
        },
        mcpReadResource: (serverName, uri) => mcpManager.readMCPResource(serverName, uri),
        mcpGetPrompt: (serverName, promptName) => mcpManager.getMCPPrompt(serverName, promptName),
        runReview,
        runRefactor,
        getCurrentProvider: () => provider,
        setProvider: async (newProvider, config) =>
        {
            provider = newProvider;
            contextManager.clearHistory();
            startNewLocalSession();
            contextManager.markSessionReset();
            runtimeConfig = {
                ...runtimeConfig,
                provider: config,
                token: config.id === "deepseek-web" ? token : runtimeConfig.token,
            };
            await saveRuntimeConfig(runtimeConfigPath, runtimeConfig);
            await saveCurrentLocalSession();
        },
        waitForInput: waitForVisibleInput,
        getToken: () => token,
        getUserName: () => userNameForContext,
        getConfiguredProviders: () => configuredProviders,
        saveUserConfig: async (update) =>
        {
            if (update.userName !== undefined) userNameForContext = update.userName ?? null;
            if (update.configuredProviders !== undefined) configuredProviders = update.configuredProviders;
            runtimeConfig = { ...runtimeConfig, ...update };
            await saveRuntimeConfig(runtimeConfigPath, runtimeConfig);
        },
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
            activeInterruptController?.abort("user-interrupt");
            activeInterruptController = null;
            interruptActiveCommand?.(new Error("Операция прервана (Ctrl+C)"));
            interruptActiveCommand = null;
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
                    interruptActiveCommand = (error: Error) =>
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
                    interruptActiveCommand = null;
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
