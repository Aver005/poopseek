import { stdout as output } from "node:process";
import ContextManager from "@/agent/context-manager";
import StreamingAgentLoop from "@/agent/streaming-loop";
import ToolExecutor from "@/agent/tool-executor";
import { colors, getColorMode } from "@/cli/colors";
import { createGenerationIndicator } from "@/cli/generation-indicator";
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
import { getTerminalCapabilities } from "@/cli/terminal-capabilities";
import { createTerminalInput } from "@/cli/terminal-input";
import { buildCommandHandlers } from "@/commands/handlers";
import type { AskUserFn } from "@/tools/types";
import { createVariableProcessor } from "@/variables";
import { SkillManager } from "@/skills";
import { loadRoleContent } from "@/roles";
import { MCPManager, loadMCPConfig } from "@/mcp";
import { loadSkillFolders } from "@/skills/skill-folders-store";
import { ensureValidToken, createAuthActions } from "@/cli/auth-flow";
import { createInputQueue } from "@/cli/input-queue";
import { createSidechatRunner } from "@/cli/sidechat";
import { SubAgentRunner } from "@/agent/sub-agent";
import { createReviewRunner } from "@/cli/review";
import { createRefactorRunner } from "@/cli/refactor";
import { LoadingView } from "@/cli/views/loading";
import { runOnboarding } from "@/cli/onboarding";
import { createProvider, DeepseekWebProvider, type ILLMProvider } from "@/providers";
import { runRoleCreation, type ActiveOperation } from "@/roles/creation";
import { createDeepseekHistoryImporter } from "@/deepseek-client/history-import";
import { FigmaServerManager, ScopeManager, FigmaLogger } from "@/figma";
import { figmaToolsRegistry, FIGMA_TOOLS_DOC } from "@/tools/defs/figma";
import { printWelcome } from "@/cli/welcome";
import { webToolsRegistry, webToolNames, WEB_TOOLS_PROMPT } from "@/tools/web-tools";
import { createAskUser } from "@/cli/ask-user";
import { createSubmitHandler } from "@/cli/submit-handler";
import { runMainLoop } from "@/cli/turn-runner";
import { createProviderStore } from "@/stores/provider";
import { createSessionStore } from "@/stores/session";
import { createConfigStore } from "@/stores/config";
import { createCallOptionsStore } from "@/stores/call-options";

declare const __APP_VERSION__: string | undefined;

export async function runCli(): Promise<void>
{
    const runtimeConfigPath = getRuntimeConfigPath();
    const loadedRuntimeConfig = await loadRuntimeConfig(runtimeConfigPath);
    const envToken = getFirstEnvValue(["DEEPSEEK_TOKEN"]);
    const envVersion = getFirstEnvValue(["POOPSEEK_VERSION", "APP_VERSION"]);
    const embeddedVersion = typeof __APP_VERSION__ === "string" ? __APP_VERSION__.trim() : "";
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

    // --- Stores ---

    const providerStore = createProviderStore({ provider, token });
    const configStore = createConfigStore({
        runtimeConfig,
        runtimeConfigPath,
        configuredProviders: runtimeConfig.configuredProviders,
    });
    const callOptionsStore = createCallOptionsStore();

    // --- Terminal / Loading ---

    const terminalInput = createTerminalInput({ getWorkspaceRoot: () => process.cwd() });
    const generationIndicator = createGenerationIndicator(output);
    const colorMode = getColorMode();
    const terminalCapabilities = getTerminalCapabilities();

    const loadingView = new LoadingView();
    await terminalInput.viewManager.push(loadingView);
    terminalInput.viewManager.renderNow();
    const reportProgress = loadingView.getProgressReporter();
    reportProgress?.(20);

    // --- Context ---

    const prompts = await readPromptFiles();
    const variableProcessor = createVariableProcessor({
        workspaceRoot: process.cwd(),
        get userName() { return configStore.getUserName(); },
    });
    const contextManager = new ContextManager(
        prompts.basePrompt,
        prompts.toolsPrompt,
        { maxMessages: 40 },
        variableProcessor,
    );
    reportProgress?.(40);

    // --- Session ---

    const sessionsDir = getSessionsDirectory();
    const sessionStore = createSessionStore({
        session: { id: createStoredSessionId(), createdAt: new Date().toISOString() },
        sessionsDir,
        modelVariant: "default",
    });

    const saveCurrentLocalSession = async (): Promise<void> =>
    {
        const sess = sessionStore.getSession();
        await saveStoredSession(sessionsDir, {
            id: sess.id,
            createdAt: sess.createdAt,
            workspaceRoot: process.cwd(),
            modelType: sessionStore.getModelVariant(),
            context: contextManager.exportState(),
        });
    };
    const startNewLocalSession = (): void =>
    {
        sessionStore.setSession({
            id: createStoredSessionId(),
            createdAt: new Date().toISOString(),
        });
    };
    const resetMainProvider = async (): Promise<void> =>
    {
        await providerStore.getProvider().reset();
        contextManager.markSessionReset();
    };

    // --- Skills ---

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

    const syncRole = (): void =>
    {
        const roleName = callOptionsStore.getActiveRoleName();
        if (roleName)
        {
            const content = loadRoleContent(roleName);
            contextManager.setRoleContent(content ?? "");
        }
        else
        {
            contextManager.setRoleContent("");
        }
    };

    const syncPoet = (): void =>
    {
        contextManager.setPoetMode(callOptionsStore.getPoetEnabled() ? prompts.poetPrompt : "");
    };

    const syncLocalSearch = (): void =>
    {
        contextManager.setWebToolsDoc(callOptionsStore.getLocalSearchEnabled() ? WEB_TOOLS_PROMPT : "");
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

    // --- Scope ---

    const scopeManager = new ScopeManager();
    const figmaLoggerRef = { current: null as FigmaLogger | null };

    // --- Agent ---

    let askUserImpl: AskUserFn = () => Promise.resolve(null);
    const subAgentRunner = new SubAgentRunner(() => providerStore.getProvider(), process.cwd());
    const mcpDynamicResolver = mcpManager.createDynamicToolResolver();
    const toolExecutor = new ToolExecutor(
        process.cwd(),
        (req) => askUserImpl(req),
        (skillName) =>
        {
            const skill = skillManager.getSkills().find((s) => s.name === skillName);
            return skill ? skill.body : null;
        },
        (toolName) => mcpDynamicResolver(toolName)
            ?? (callOptionsStore.getLocalSearchEnabled() ? webToolsRegistry[toolName] : undefined)
            ?? (scopeManager.isFigma() ? figmaToolsRegistry[toolName] : undefined),
        () => [
            ...mcpManager.getDynamicToolNames(),
            ...(callOptionsStore.getLocalSearchEnabled() ? webToolNames : []),
            ...(scopeManager.isFigma() ? Object.keys(figmaToolsRegistry) : []),
        ],
        subAgentRunner,
        (message) => generationIndicator.activate(message),
    );
    reportProgress?.(95);

    const getCallOptions = () => ({
        modelVariant: sessionStore.getModelVariant(),
        searchEnabled: callOptionsStore.getSearchEnabled(),
        thinkingEnabled: callOptionsStore.getThinkingEnabled(),
    });

    const figmaServerManager = new FigmaServerManager({
        getProvider: () => providerStore.getProvider(),
        basePrompt: prompts.basePrompt,
        toolsPrompt: prompts.toolsPrompt,
        figmaPrompt: prompts.figmaPrompt,
        variableProcessor,
        getCallOptions,
        getRequestDelay: () => callOptionsStore.getRequestDelayMs(),
        getWebToolsDoc: () => callOptionsStore.getLocalSearchEnabled() ? WEB_TOOLS_PROMPT : "",
    });

    const agentLoop = new StreamingAgentLoop(() => providerStore.getProvider(), contextManager, toolExecutor, {
        maxToolsPerStep: 1,
        getCallOptions,
        getRequestDelay: () => callOptionsStore.getRequestDelayMs(),
    });

    reportProgress?.(100);
    await terminalInput.viewManager.pop();

    // --- Shared mutable refs ---

    const isRoleCreationActiveRef = { current: false };
    const isMainTurnActiveRef = { current: false };
    const activeOperationRef = { current: null as ActiveOperation | null };
    const activeInterruptControllerRef = { current: null as AbortController | null };
    const activeInterruptCommandRef = { current: null as ((error: Error) => void) | null };

    terminalInput.setStatusLine(() =>
    {
        const p = providerStore.getProvider();
        const modelVariant = sessionStore.getModelVariant();
        const isDeepseekWeb = p.info.id === "deepseek-web";
        const displayModel = isDeepseekWeb ? modelVariant : p.info.model;
        const label = displayModel ? `${p.info.label} · ${displayModel}` : p.info.label;
        const parts: string[] = [colors.magenta(label)];
        if (isRoleCreationActiveRef.current)
        {
            parts.push(colors.yellow("сценарий: Создание роли"));
            return colors.dim("◆ ") + parts.join(colors.dim(" · "));
        }
        parts.push(colors.dim(`${contextManager.getMessageCount()} msg`));
        if (callOptionsStore.getSearchEnabled()) parts.push(colors.green("web"));
        if (callOptionsStore.getLocalSearchEnabled()) parts.push(colors.green("web:local"));
        if (callOptionsStore.getThinkingEnabled()) parts.push(colors.cyan("think"));
        const rateDelayMs = callOptionsStore.getRequestDelayMs();
        if (rateDelayMs > 0) parts.push(colors.yellow(`rate:${rateDelayMs}ms`));
        const activeSkillsCount = skillManager.getActiveNames().length;
        if (activeSkillsCount > 0) parts.push(colors.yellow(`${activeSkillsCount} skills`));
        const activeRoleName = callOptionsStore.getActiveRoleName();
        if (activeRoleName) parts.push(colors.cyan(`role:${activeRoleName}`));
        if (callOptionsStore.getPoetEnabled()) parts.push(colors.magenta("poet"));
        if (scopeManager.isFigma()) parts.push(colors.blue("figma"));
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

    const buildFigmaContext = (): string =>
        [prompts.figmaPrompt, "", FIGMA_TOOLS_DOC].join("\n");

    const enterFigmaScope = async (): Promise<void> =>
    {
        const jamId = crypto.randomUUID();
        const logger = new FigmaLogger(jamId, (text) => writeDetachedOutput(`${colors.dim(text)}\n`));
        await logger.init();
        figmaLoggerRef.current = logger;
        scopeManager.enter(jamId);
        contextManager.setFigmaContext(buildFigmaContext());
    };

    const exitFigmaScope = (): void =>
    {
        scopeManager.exit();
        figmaLoggerRef.current = null;
        contextManager.setFigmaContext("");
    };

    const loadFigmaJam = async (sessionId: string): Promise<{ error?: string }> =>
    {
        const state = await FigmaLogger.loadContext(sessionId);
        if (!state) return { error: "Jam не найден" };
        contextManager.restoreState(state);
        const logger = new FigmaLogger(sessionId, (text) => writeDetachedOutput(`${colors.dim(text)}\n`));
        await logger.init();
        figmaLoggerRef.current = logger;
        scopeManager.enter(sessionId);
        contextManager.setFigmaContext(buildFigmaContext());
        return {};
    };

    askUserImpl = createAskUser({ inputQueue, terminalInput, generationIndicator });

    // --- Auth actions ---

    const { relogin, logout } = createAuthActions({
        runtimeConfigPath: configStore.getRuntimeConfigPath(),
        contextManager,
        waitForInput: waitForVisibleInput,
        writeOutput: writeDetachedOutput,
        startNewLocalSession,
        onReloggedIn: (newProvider) => { providerStore.setProvider(newProvider); },
        getRuntimeConfig: () => configStore.getRuntimeConfig(),
    });

    // --- Sidechat / Review / Refactor ---

    const { runSidechat, startQueuedSidechat, pendingTasks: pendingSidechatTasks } = createSidechatRunner({
        getProvider: () => providerStore.getProvider(),
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
        getProvider: () => providerStore.getProvider(),
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
        getProvider: () => providerStore.getProvider(),
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

    const onGoHome = (): void =>
    {
        const wasCancelledOperation = cancelActiveOperation();
        activeInterruptCommandRef.current?.(new Error("Операция прервана (/home)"));
        activeInterruptCommandRef.current = null;
        if (inputQueue.hasPendingWaiter())
        {
            inputQueue.resolveWaiter("");
        }
        inputQueue.clear();
        if (wasCancelledOperation)
            output.write(`\n${colors.yellow("Создание роли прервано.")}\n`);

        printWelcome(
            appVersion,
            providerStore.getProvider(),
            colorMode,
            terminalCapabilities
        );

        terminalInput.setPromptPrefix(`${colors.magenta(">")} `);
        terminalInput.setMode("active");
        if (!isMainTurnActiveRef.current)
        {
            terminalInput.setRenderEnabled(true);
        }
    };

    // --- Command handlers ---

    const commands = buildCommandHandlers(terminalInput, {
        providerStore,
        sessionStore,
        configStore,
        callOptionsStore,
        contextManager,
        startNewLocalSession,
        resetMainProvider,
        saveCurrentLocalSession,
        activeInterruptControllerRef,
        skillManager,
        mcpManager,
        syncMCP,
        syncSkills,
        syncAvailableSkills,
        syncRole,
        syncLocalSearch,
        syncPoet,
        poetPrompt: prompts.poetPrompt,
        viewManager: terminalInput.viewManager,
        choose: (title, items) => terminalInput.choose(title, items),
        confirm: (message) => terminalInput.confirm(message),
        waitForInput: waitForVisibleInput,
        runSidechat,
        runReview,
        runRefactor,
        logout,
        relogin,
        createRole: () => runRoleCreation({
            getProvider: () => providerStore.getProvider(),
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
        getRemoteSessionImporter: () =>
        {
            const p = providerStore.getProvider();
            return p instanceof DeepseekWebProvider ? createDeepseekHistoryImporter(p) : undefined;
        },
        figmaServerManager,
        getAgentScope: () => scopeManager.scope,
        getFigmaJamId: () => scopeManager.jamId,
        enterFigmaScope,
        exitFigmaScope,
        loadFigmaJam,
    });

    // --- Terminal input callbacks ---

    terminalInput.setQueueCallbacks({
        onValueChange: (value) =>
        {
            if (value.length > 0) generationIndicator.pause();
            else generationIndicator.resume();
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
            activeInterruptCommandRef.current?.(new Error("Операция прервана (Ctrl+C)"));
            activeInterruptCommandRef.current = null;
        },
    });

    terminalInput.onSubmit(createSubmitHandler({
        activeOperationRef,
        cancelActiveOperation,
        inputQueue,
        startQueuedSidechat,
        writeDetachedOutput,
        onGoHome,
    }));

    printWelcome(
        appVersion,
        providerStore.getProvider(),
        colorMode,
        terminalCapabilities
    );

    terminalInput.start(commands);

    const MAX_MESSAGES = 40;
    const WARN_AT_MESSAGES = MAX_MESSAGES - 5;

    await runMainLoop({
        inputQueue,
        terminalInput,
        agentLoop,
        saveCurrentLocalSession,
        isMainTurnActiveRef,
        activeInterruptControllerRef,
        activeInterruptCommandRef,
        commands,
        generationIndicator,
        writeUserMessage,
        pendingSidechatTasks,
        onFigmaToolDone: (toolName, args, result, durationMs) =>
        {
            figmaLoggerRef.current?.logTool(toolName, args, result, durationMs).catch(() => {});
            if (result.data && figmaServerManager.isRunning)
            {
                fetch(`http://localhost:${figmaServerManager.port}/v1/ops`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ ops: Array.isArray(result.data) ? result.data : [result.data] }),
                }).catch(() => {});
            }
        },
        onTurnComplete: () =>
        {
            const count = contextManager.getMessageCount();
            if (count >= WARN_AT_MESSAGES)
            {
                const isFull = count >= MAX_MESSAGES;
                const msg = isFull
                    ? `Контекст заполнен (${count}/${MAX_MESSAGES} сообщ.). Используйте /compact.`
                    : `Контекст почти заполнен (${count}/${MAX_MESSAGES} сообщ.). Рекомендуется /compact.`;
                output.write(`${colors.yellow("⚠")} ${colors.dim(msg)}\n`);
            }
            if (scopeManager.isFigma())
            {
                figmaLoggerRef.current?.saveContext(contextManager.exportState()).catch(() => {});
            }
        },
    });
}
