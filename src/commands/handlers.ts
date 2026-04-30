import ContextManager from "@/agent/context-manager";
import { getColorMode, setTheme } from "@/cli/colors";
import { listStoredSessions, loadStoredSession } from "@/cli/session-store";
import { saveRuntimeConfig } from "@/cli/runtime-config";
import type { PromptFiles } from "@/cli/prompt-files";
import type { TerminalChoiceItem } from "@/cli/terminal-input";
import type { VariableProcessor } from "@/variables";
import type { MCPManager } from "@/mcp";
import { loadMCPConfig } from "@/mcp";
import type { SkillManager } from "@/skills";
import type { ReviewScope } from "@/cli/review";
import type { RefactorLevel } from "@/cli/refactor";
import type { ViewManager } from "@/cli/view-manager";
import type { Command } from "./types";
import { createCommandHandlers } from "./index";
import { listRoles, loadRoleContent, deleteRole } from "@/roles";
import { createSessionResolver, type RemoteSessionImporter } from "@/sessions";
import type { ProviderStore } from "@/stores/provider";
import type { SessionStore } from "@/stores/session";
import type { ConfigStore } from "@/stores/config";
import type { CallOptionsStore } from "@/stores/call-options";
import { createProvider } from "@/providers";
import type { ProviderConfig } from "@/providers";
import type { FigmaServerManager } from "@/figma";

export type CommandHandlerDeps = {
    // Stores
    providerStore: ProviderStore;
    sessionStore: SessionStore;
    configStore: ConfigStore;
    callOptionsStore: CallOptionsStore;

    // Context manager
    contextManager: ContextManager;

    // Sessions (functions)
    startNewLocalSession: () => void;
    resetMainProvider: () => Promise<void>;
    saveCurrentLocalSession: () => Promise<void>;

    // Interrupt
    activeInterruptControllerRef: { current: AbortController | null };

    // Skills / MCP
    skillManager: SkillManager;
    mcpManager: MCPManager;
    syncMCP: () => Promise<void>;
    syncSkills: () => void;
    syncAvailableSkills: () => void;

    // Roles
    syncRole: () => void;

    // Web tools (local)
    syncLocalSearch: () => void;

    // Poet mode
    syncPoet: () => void;
    poetPrompt: string;

    // Terminal UI
    viewManager: ViewManager;
    choose: (title: string, items: TerminalChoiceItem[]) => Promise<string | null>;
    confirm: (message: string) => Promise<boolean>;
    waitForInput: () => Promise<string>;

    // Runners
    runSidechat: (question: string) => Promise<void>;
    runReview: (scope: ReviewScope) => Promise<void>;
    runRefactor: (level: RefactorLevel, focus?: string) => Promise<void>;

    // Auth
    logout: () => Promise<void>;
    relogin: () => Promise<void>;

    // Role creation
    createRole: () => Promise<void>;
    cancelActiveOperation: () => boolean;

    // Compact
    prompts: Pick<PromptFiles, "compactPrompt">;
    variableProcessor: VariableProcessor;

    // Remote session import (provider-specific, evaluated lazily on each load)
    getRemoteSessionImporter?: () => RemoteSessionImporter | undefined;

    figmaServerManager: FigmaServerManager;

    // Scope
    getAgentScope: () => "chat" | "figma";
    getFigmaJamId: () => string | null;
    enterFigmaScope: () => Promise<void>;
    exitFigmaScope: () => void;
    loadFigmaJam: (sessionId: string) => Promise<{ error?: string }>;
};

function formatSessionDate(value: string): string
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
}

export function buildCommandHandlers(
    rl: { close: () => void; viewManager: ViewManager; setRenderEnabled?: (enabled: boolean) => void },
    deps: CommandHandlerDeps,
): Map<string, Command>
{
    const { providerStore, sessionStore, configStore, callOptionsStore } = deps;

    const resolveSessionForLoad = createSessionResolver({
        sessionsDir: sessionStore.getSessionsDir(),
        contextManager: deps.contextManager,
        getCurrentLocalSession: () => sessionStore.getSession(),
        setCurrentLocalSession: (s) => sessionStore.setSession(s),
        getModelVariant: () => sessionStore.getModelVariant(),
        setModelVariant: (v) => sessionStore.setModelVariant(v),
        resetMainProvider: deps.resetMainProvider,
        saveCurrentLocalSession: deps.saveCurrentLocalSession,
        startNewLocalSession: deps.startNewLocalSession,
        activeInterruptControllerRef: deps.activeInterruptControllerRef,
        getRemoteImporter: deps.getRemoteSessionImporter,
    });

    return createCommandHandlers(rl, {
        viewManager: deps.viewManager,

        getSessionInfo: () =>
        {
            const provider = providerStore.getProvider();
            const remoteId = "getSessionId" in provider && typeof (provider as { getSessionId?: () => string | null }).getSessionId === "function"
                ? ((provider as { getSessionId: () => string | null }).getSessionId() ?? "—")
                : "—";
            return [
                `Provider: ${provider.info.label}`,
                `Remote session ID: ${remoteId}`,
                `Local session ID: ${sessionStore.getSession().id}`,
            ].join(" | ");
        },

        getContextStats: () =>
        {
            return `Messages in local context: ${deps.contextManager.getMessageCount()}`;
        },

        clearHistory: async () =>
        {
            deps.contextManager.clearHistory();
            deps.startNewLocalSession();
            await deps.resetMainProvider();
            await deps.saveCurrentLocalSession();
        },

        resetSession: async () =>
        {
            deps.contextManager.clearHistory();
            deps.startNewLocalSession();
            await deps.resetMainProvider();
            await deps.saveCurrentLocalSession();
        },

        openSessions: async () =>
        {
            const sessions = await listStoredSessions(sessionStore.getSessionsDir());
            if (sessions.length === 0)
            {
                return { loaded: false };
            }

            const selectedId = await deps.choose(
                "Сохраненные сессии",
                sessions.map((item) => ({
                    value: item.id,
                    label: `${formatSessionDate(item.updatedAt)} | ${item.title}`,
                    hint: `${item.messageCount} сообщений | ${item.modelType} | ${item.workspaceRoot}`,
                })),
            );

            if (!selectedId) return { loaded: false, cancelled: true };
            const snapshot = await loadStoredSession(sessionStore.getSessionsDir(), selectedId);
            if (!snapshot) return { loaded: false };

            sessionStore.setSession({ id: snapshot.id, createdAt: snapshot.createdAt });
            sessionStore.setModelVariant(snapshot.modelType);
            deps.contextManager.restoreState(snapshot.context);
            await deps.resetMainProvider();
            await deps.saveCurrentLocalSession();

            const title = sessions.find((item) => item.id === snapshot.id)?.title ?? "без названия";
            return { loaded: true, title };
        },

        getTheme: () => getColorMode().theme,
        setTheme: (theme) => setTheme(theme),

        getModelType: () => sessionStore.getModelVariant() as "default" | "expert",
        setModelType: (nextModelType) => sessionStore.setModelVariant(nextModelType),

        getModel: () =>
        {
            const provider = providerStore.getProvider();
            if (provider.info.id === "deepseek-web") return sessionStore.getModelVariant();
            const config = configStore.getRuntimeConfig().provider;
            if (config && "model" in config) return config.model as string;
            return provider.info.id;
        },

        setModel: async (model: string) =>
        {
            const provider = providerStore.getProvider();
            if (provider.info.id === "deepseek-web")
            {
                sessionStore.setModelVariant(model);
                return;
            }
            const runtimeConfig = configStore.getRuntimeConfig();
            if (!runtimeConfig.provider || !("model" in runtimeConfig.provider)) return;
            const newConfig = { ...runtimeConfig.provider, model } as ProviderConfig;
            const newProvider = await createProvider(newConfig, providerStore.getToken());
            providerStore.setProvider(newProvider);
            const configured = configStore.getConfiguredProviders();
            const updatedConfigured = configured.map((c) => c.id === newConfig.id ? newConfig : c);
            configStore.setConfiguredProviders(updatedConfigured);
            const updated = { ...runtimeConfig, provider: newConfig, configuredProviders: updatedConfigured };
            configStore.setRuntimeConfig(updated);
            await saveRuntimeConfig(configStore.getRuntimeConfigPath(), updated);
        },

        listModels: () => providerStore.getProvider().listModels(),

        getSearchEnabled: () => callOptionsStore.getSearchEnabled(),
        setSearchEnabled: (enabled) => callOptionsStore.setSearchEnabled(enabled),
        getLocalSearchEnabled: () => callOptionsStore.getLocalSearchEnabled(),
        setLocalSearchEnabled: (enabled) =>
        {
            callOptionsStore.setLocalSearchEnabled(enabled);
            deps.syncLocalSearch();
        },
        getThinkingEnabled: () => callOptionsStore.getThinkingEnabled(),
        setThinkingEnabled: (enabled) => callOptionsStore.setThinkingEnabled(enabled),
        getPoetEnabled: () => callOptionsStore.getPoetEnabled(),
        setPoetEnabled: (enabled) =>
        {
            callOptionsStore.setPoetEnabled(enabled);
            deps.syncPoet();
        },
        getRateDelay: () => callOptionsStore.getRequestDelayMs(),
        setRateDelay: (ms) => callOptionsStore.setRequestDelayMs(ms),

        runSidechat: deps.runSidechat,
        confirm: deps.confirm,
        resolveSessionForLoad,

        compactContext: async () =>
        {
            const before = deps.contextManager.getMessageCount();
            if (before === 0) return null;

            const dialogue = deps.contextManager.getDialogueSnapshot();
            const compactPrompt = [
                deps.prompts.compactPrompt.trim(),
                "",
                "## Диалог",
                dialogue,
            ].join("\n");

            const compactProvider = await providerStore.getProvider().clone();
            const chunks: string[] = [];
            for await (const chunk of compactProvider.complete(
                [{ role: "user" as const, content: compactPrompt }],
                "",
                { modelVariant: sessionStore.getModelVariant() },
            ))
            {
                chunks.push(chunk);
            }
            const summary = chunks.join("").trim();
            if (summary.length === 0) throw new Error("Модель вернула пустую сводку");

            deps.contextManager.replaceWithCompactSummary(summary);
            await deps.resetMainProvider();
            await deps.saveCurrentLocalSession();
            return {
                before,
                after: deps.contextManager.getMessageCount(),
                summaryChars: summary.length,
            };
        },

        logout: deps.logout,
        relogin: deps.relogin,
        choose: deps.choose,

        getSkills: () => deps.skillManager.getSkills(),
        isSkillActive: (name) => deps.skillManager.isActive(name),
        activateSkill: (name) =>
        {
            const ok = deps.skillManager.activate(name);
            if (ok) deps.syncSkills();
            return ok;
        },
        activateAllSkills: () =>
        {
            deps.skillManager.activateAll();
            deps.syncSkills();
        },
        deactivateSkill: (name) =>
        {
            const ok = deps.skillManager.deactivate(name);
            deps.syncSkills();
            return ok;
        },
        clearSkills: () =>
        {
            deps.skillManager.clearActive();
            deps.syncSkills();
        },
        getSkillFolders: () => deps.skillManager.getExtraFolders(),
        addSkillFolder: async (folder) =>
        {
            deps.skillManager.addExtraFolder(folder);
            deps.skillManager.rediscover();
            deps.syncAvailableSkills();
            const { saveSkillFolders } = await import("@/skills/skill-folders-store");
            await saveSkillFolders(deps.skillManager.getExtraFolders());
        },
        removeSkillFolder: async (folder) =>
        {
            deps.skillManager.removeExtraFolder(folder);
            deps.skillManager.rediscover();
            deps.syncAvailableSkills();
            const { saveSkillFolders } = await import("@/skills/skill-folders-store");
            await saveSkillFolders(deps.skillManager.getExtraFolders());
        },
        resetSkillFolders: async () =>
        {
            deps.skillManager.resetExtraFolders();
            deps.skillManager.rediscover();
            deps.syncAvailableSkills();
            const { saveSkillFolders } = await import("@/skills/skill-folders-store");
            await saveSkillFolders([]);
        },

        getMCPServerStatuses: () => deps.mcpManager.getServerStatuses(),
        getMCPTools: () => deps.mcpManager.getAllTools(),
        getMCPResources: () => deps.mcpManager.getAllResources(),
        getMCPPrompts: () => deps.mcpManager.getAllPrompts(),
        mcpConnect: async (name) =>
        {
            await deps.mcpManager.connectServer(name);
            await deps.syncMCP();
            deps.syncSkills();
            deps.syncAvailableSkills();
        },
        mcpDisconnect: async (name) =>
        {
            await deps.mcpManager.disconnectServer(name);
            await deps.syncMCP();
            deps.syncSkills();
            deps.syncAvailableSkills();
        },
        mcpEnable: async (name) =>
        {
            await deps.mcpManager.enableServer(name);
            await deps.syncMCP();
            deps.syncSkills();
            deps.syncAvailableSkills();
        },
        mcpDisable: async (name) =>
        {
            await deps.mcpManager.disableServer(name);
            await deps.syncMCP();
            deps.syncSkills();
            deps.syncAvailableSkills();
        },
        mcpReload: async () =>
        {
            const freshConfig = loadMCPConfig(process.cwd());
            await deps.mcpManager.reloadAll(freshConfig.servers, freshConfig.disabled);
            await deps.syncMCP();
            deps.syncSkills();
            deps.syncAvailableSkills();
        },
        mcpReadResource: (serverName, uri) => deps.mcpManager.readMCPResource(serverName, uri),
        mcpGetPrompt: (serverName, promptName) => deps.mcpManager.getMCPPrompt(serverName, promptName),

        runReview: deps.runReview,
        runRefactor: deps.runRefactor,

        getCurrentProvider: () => providerStore.getProvider(),
        setProvider: async (newProvider, config) =>
        {
            providerStore.setProvider(newProvider);
            deps.contextManager.clearHistory();
            deps.startNewLocalSession();
            deps.contextManager.markSessionReset();
            const runtimeConfig = configStore.getRuntimeConfig();
            const updated = {
                ...runtimeConfig,
                provider: config,
                token: config.id === "deepseek-web" ? providerStore.getToken() : runtimeConfig.token,
            };
            configStore.setRuntimeConfig(updated);
            await saveRuntimeConfig(configStore.getRuntimeConfigPath(), updated);
            await deps.saveCurrentLocalSession();
        },

        waitForInput: deps.waitForInput,
        getToken: () => providerStore.getToken(),
        getUserName: () => configStore.getUserName(),
        getConfiguredProviders: () => configStore.getConfiguredProviders(),

        listRoles: () => listRoles().map((r) => ({ name: r.name })),
        getActiveRole: () => callOptionsStore.getActiveRoleName(),
        setActiveRole: (roleName) =>
        {
            if (roleName === "")
            {
                callOptionsStore.setActiveRoleName(null);
                deps.syncRole();
                return true;
            }
            const content = loadRoleContent(roleName);
            if (content === null) return false;
            callOptionsStore.setActiveRoleName(roleName);
            deps.syncRole();
            return true;
        },
        deleteRole: (roleName) => deleteRole(roleName),
        createRole: deps.createRole,
        cancelActiveOperation: deps.cancelActiveOperation,
        setRenderEnabled: rl.setRenderEnabled ? (enabled) => rl.setRenderEnabled!(enabled) : undefined,

        getCurrentSessionSnapshot: () =>
        {
            const session = sessionStore.getSession();
            return {
                messages: deps.contextManager.getMessages(),
                sessionId: session.id,
                createdAt: session.createdAt,
            };
        },
        loadSessionById: (id) => loadStoredSession(sessionStore.getSessionsDir(), id),

        getFigmaServerStatus: () => ({
            running: deps.figmaServerManager.isRunning,
            port: deps.figmaServerManager.port,
        }),
        startFigmaServer: () => deps.figmaServerManager.start(),
        stopFigmaServer: () => deps.figmaServerManager.stop(),

        getAgentScope: deps.getAgentScope,
        getFigmaJamId: deps.getFigmaJamId,
        enterFigmaScope: deps.enterFigmaScope,
        exitFigmaScope: deps.exitFigmaScope,
        loadFigmaJam: deps.loadFigmaJam,

        saveUserConfig: async (update) =>
        {
            if (update.userName !== undefined) configStore.setUserName(update.userName ?? null);
            if (update.configuredProviders !== undefined) configStore.setConfiguredProviders(update.configuredProviders);
            const updated = { ...configStore.getRuntimeConfig(), ...update };
            configStore.setRuntimeConfig(updated);
            await saveRuntimeConfig(configStore.getRuntimeConfigPath(), updated);
        },
    });
}
