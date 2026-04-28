import ContextManager from "@/agent/context-manager";
import { getColorMode, setTheme } from "@/cli/colors";
import { listStoredSessions, loadStoredSession } from "@/cli/session-store";
import { saveRuntimeConfig } from "@/cli/runtime-config";
import type { PromptFiles } from "@/cli/prompt-files";
import type { RuntimeConfig } from "@/cli/runtime-config";
import type { TerminalChoiceItem } from "@/cli/terminal-input";
import type { VariableProcessor } from "@/variables";
import type { MCPManager } from "@/mcp";
import { loadMCPConfig } from "@/mcp";
import type { SkillManager } from "@/skills";
import type { ILLMProvider, ProviderConfig } from "@/providers";
import type { ReviewScope } from "@/cli/review";
import type { RefactorLevel } from "@/cli/refactor";
import type { ViewManager } from "@/cli/view-manager";
import type { Command } from "./types";
import { createCommandHandlers } from "./index";
import { listRoles, loadRoleContent, deleteRole } from "@/roles";
import { createSessionResolver, type RemoteSessionImporter } from "@/sessions";

export type CommandHandlerDeps = {
    // Provider
    getProvider: () => ILLMProvider;
    setProvider: (p: ILLMProvider) => void;

    // Context manager
    contextManager: ContextManager;

    // Sessions (local)
    sessionsDir: string;
    getCurrentLocalSession: () => { id: string; createdAt: string };
    setCurrentLocalSession: (s: { id: string; createdAt: string }) => void;
    getModelVariant: () => string;
    setModelVariant: (v: string) => void;
    startNewLocalSession: () => void;
    resetMainProvider: () => Promise<void>;
    saveCurrentLocalSession: () => Promise<void>;

    // Config
    runtimeConfigPath: string;
    getRuntimeConfig: () => RuntimeConfig;
    setRuntimeConfig: (c: RuntimeConfig) => void;
    getToken: () => string;
    getUserName: () => string | null;
    setUserName: (n: string | null) => void;
    getConfiguredProviders: () => ProviderConfig[];
    setConfiguredProviders: (ps: ProviderConfig[]) => void;

    // Interrupt
    activeInterruptControllerRef: { current: AbortController | null };

    // Skills / MCP
    skillManager: SkillManager;
    mcpManager: MCPManager;
    syncMCP: () => Promise<void>;
    syncSkills: () => void;
    syncAvailableSkills: () => void;

    // Roles
    getActiveRoleName: () => string | null;
    setActiveRoleName: (name: string | null) => void;
    syncRole: () => void;

    // Terminal UI
    viewManager: ViewManager;
    choose: (title: string, items: TerminalChoiceItem[]) => Promise<string | null>;
    confirm: (message: string) => Promise<boolean>;
    waitForInput: () => Promise<string>;

    // Search / thinking toggles
    getSearchEnabled: () => boolean;
    setSearchEnabled: (enabled: boolean) => void;
    getThinkingEnabled: () => boolean;
    setThinkingEnabled: (enabled: boolean) => void;

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
    rl: { close: () => void; viewManager: ViewManager },
    deps: CommandHandlerDeps,
): Map<string, Command>
{
    const resolveSessionForLoad = createSessionResolver({
        sessionsDir: deps.sessionsDir,
        contextManager: deps.contextManager,
        getCurrentLocalSession: deps.getCurrentLocalSession,
        setCurrentLocalSession: deps.setCurrentLocalSession,
        getModelVariant: deps.getModelVariant,
        setModelVariant: deps.setModelVariant,
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
            const provider = deps.getProvider();
            const remoteId = "getSessionId" in provider && typeof (provider as { getSessionId?: () => string | null }).getSessionId === "function"
                ? ((provider as { getSessionId: () => string | null }).getSessionId() ?? "—")
                : "—";
            return [
                `Provider: ${provider.info.label}`,
                `Remote session ID: ${remoteId}`,
                `Local session ID: ${deps.getCurrentLocalSession().id}`,
            ].join(" | ");
        },

        getContextStats: () =>
        {
            const cm = deps.contextManager;
            return `Messages in local context: ${cm.getMessageCount()}`;
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
            const sessions = await listStoredSessions(deps.sessionsDir);
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
            const snapshot = await loadStoredSession(deps.sessionsDir, selectedId);
            if (!snapshot) return { loaded: false };

            deps.setCurrentLocalSession({ id: snapshot.id, createdAt: snapshot.createdAt });
            deps.setModelVariant(snapshot.modelType);
            deps.contextManager.restoreState(snapshot.context);
            await deps.resetMainProvider();
            await deps.saveCurrentLocalSession();

            const title = sessions.find((item) => item.id === snapshot.id)?.title ?? "без названия";
            return { loaded: true, title };
        },

        getTheme: () => getColorMode().theme,
        setTheme: (theme) => setTheme(theme),

        getModelType: () => deps.getModelVariant() as "default" | "expert",
        setModelType: (nextModelType) => deps.setModelVariant(nextModelType),

        getSearchEnabled: deps.getSearchEnabled,
        setSearchEnabled: deps.setSearchEnabled,
        getThinkingEnabled: deps.getThinkingEnabled,
        setThinkingEnabled: deps.setThinkingEnabled,

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

            const compactProvider = await deps.getProvider().clone();
            const chunks: string[] = [];
            for await (const chunk of compactProvider.complete(
                [{ role: "user", content: compactPrompt }],
                "",
                { modelVariant: deps.getModelVariant() },
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

        getCurrentProvider: deps.getProvider,
        setProvider: async (newProvider, config) =>
        {
            deps.setProvider(newProvider);
            deps.contextManager.clearHistory();
            deps.startNewLocalSession();
            deps.contextManager.markSessionReset();
            const updated: RuntimeConfig = {
                ...deps.getRuntimeConfig(),
                provider: config,
                token: config.id === "deepseek-web" ? deps.getToken() : deps.getRuntimeConfig().token,
            };
            deps.setRuntimeConfig(updated);
            await saveRuntimeConfig(deps.runtimeConfigPath, updated);
            await deps.saveCurrentLocalSession();
        },

        waitForInput: deps.waitForInput,
        getToken: deps.getToken,
        getUserName: deps.getUserName,
        getConfiguredProviders: deps.getConfiguredProviders,

        listRoles: () => listRoles().map((r) => ({ name: r.name })),
        getActiveRole: deps.getActiveRoleName,
        setActiveRole: (roleName) =>
        {
            if (roleName === "")
            {
                deps.setActiveRoleName(null);
                deps.syncRole();
                return true;
            }
            const content = loadRoleContent(roleName);
            if (content === null) return false;
            deps.setActiveRoleName(roleName);
            deps.syncRole();
            return true;
        },
        deleteRole: (roleName) => deleteRole(roleName),
        createRole: deps.createRole,
        cancelActiveOperation: deps.cancelActiveOperation,

        saveUserConfig: async (update) =>
        {
            if (update.userName !== undefined) deps.setUserName(update.userName ?? null);
            if (update.configuredProviders !== undefined) deps.setConfiguredProviders(update.configuredProviders);
            const updated: RuntimeConfig = { ...deps.getRuntimeConfig(), ...update };
            deps.setRuntimeConfig(updated);
            await saveRuntimeConfig(deps.runtimeConfigPath, updated);
        },
    });
}
