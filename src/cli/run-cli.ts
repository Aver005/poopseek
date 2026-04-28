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
import { printWelcome } from "@/cli/welcome";
import { createAskUser } from "@/cli/ask-user";
import { createSubmitHandler } from "@/cli/submit-handler";
import { runMainLoop } from "@/cli/turn-runner";

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

    let userNameForContext = runtimeConfig.userName;
    let configuredProviders = runtimeConfig.configuredProviders;

    const terminalInput = createTerminalInput({ getWorkspaceRoot: () => process.cwd() });
    const generationIndicator = createGenerationIndicator(output);
    const colorMode = getColorMode();
    const terminalCapabilities = getTerminalCapabilities();

    const loadingView = new LoadingView();
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
    const subAgentRunner = new SubAgentRunner(() => provider, process.cwd());
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

    const getCallOptions = () => ({ modelVariant, searchEnabled, thinkingEnabled });

    const agentLoop = new StreamingAgentLoop(() => provider, contextManager, toolExecutor, {
        getCallOptions,
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

    askUserImpl = createAskUser({ inputQueue, terminalInput, generationIndicator });

    // --- Auth actions ---

    const { relogin, logout } = createAuthActions({
        runtimeConfigPath,
        contextManager,
        waitForInput: waitForVisibleInput,
        writeOutput: writeDetachedOutput,
        startNewLocalSession,
        onReloggedIn: (newProvider) => { provider = newProvider; },
        getRuntimeConfig: () => runtimeConfig,
    });

    // --- Sidechat / Review / Refactor ---

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
    }));

    printWelcome(appVersion, provider, colorMode, terminalCapabilities);

    terminalInput.start(commands);

    await runMainLoop({
        inputQueue,
        terminalInput,
        agentLoop,
        saveCurrentLocalSession,
        isMainTurnActiveRef,
        activeInterruptCommandRef,
        commands,
        generationIndicator,
        writeUserMessage,
        pendingSidechatTasks,
    });
}
