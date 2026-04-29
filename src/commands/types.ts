export interface Command
{
    name: string;
    description: string;
    execute: (args: string[]) => Promise<boolean> | boolean;
}

export interface CommandsContext
{
    viewManager?: import("@/cli/view-manager").ViewManager;
    getSessionInfo?: () => string;
    getContextStats?: () => string;
    clearHistory?: () => Promise<void> | void;
    openSessions?: () => Promise<{
        loaded: boolean;
        cancelled?: boolean;
        title?: string;
    }>;
    compactContext?: () => Promise<{
        before: number;
        after: number;
        summaryChars: number;
    } | null>;
    resetSession?: () => Promise<void>;
    getTheme?: () => "dark" | "light";
    setTheme?: (theme: "dark" | "light") => void;
    getModelType?: () => "default" | "expert";
    setModelType?: (modelType: "default" | "expert") => void;
    getModel?: () => string;
    setModel?: (model: string) => Promise<void>;
    listModels?: () => Promise<string[]>;
    runSidechat?: (question: string) => Promise<void>;
    confirm?: (message: string) => Promise<boolean>;
    resolveSessionForLoad?: (id: string) => Promise<{
        type: "local" | "global";
        title: string;
        messageCount?: number;
        load: () => Promise<{ error?: string }>;
    } | null>;
    logout?: () => Promise<void>;
    relogin?: () => Promise<void>;
    choose?: (title: string, items: { value: string; label: string; hint?: string }[]) => Promise<string | null>;
    getSkills?: () => { name: string; description: string }[];
    isSkillActive?: (name: string) => boolean;
    activateSkill?: (name: string) => boolean;
    activateAllSkills?: () => void;
    deactivateSkill?: (name: string) => boolean;
    clearSkills?: () => void;
    getSkillFolders?: () => string[];
    addSkillFolder?: (folder: string) => Promise<void>;
    removeSkillFolder?: (folder: string) => Promise<void>;
    resetSkillFolders?: () => Promise<void>;
    getMCPServerStatuses?: () => import("@/mcp").MCPServerInfo[];
    getMCPTools?: () => import("@/mcp").MCPToolInfo[];
    getMCPResources?: () => import("@/mcp").MCPResourceInfo[];
    getMCPPrompts?: () => import("@/mcp").MCPPromptInfo[];
    mcpConnect?: (name: string) => Promise<void>;
    mcpDisconnect?: (name: string) => Promise<void>;
    mcpEnable?: (name: string) => Promise<void>;
    mcpDisable?: (name: string) => Promise<void>;
    mcpReload?: () => Promise<void>;
    mcpReadResource?: (serverName: string, uri: string) => Promise<string>;
    mcpGetPrompt?: (serverName: string, promptName: string) => Promise<string>;
    getSearchEnabled?: () => boolean;
    setSearchEnabled?: (enabled: boolean) => void;
    getThinkingEnabled?: () => boolean;
    setThinkingEnabled?: (enabled: boolean) => void;
    getPoetEnabled?: () => boolean;
    setPoetEnabled?: (enabled: boolean) => void;
    runReview?: (scope: import("@/cli/review").ReviewScope) => Promise<void>;
    runRefactor?: (level: import("@/cli/refactor").RefactorLevel, focus?: string) => Promise<void>;
    getCurrentProvider?: () => import("@/providers").ILLMProvider;
    setProvider?: (provider: import("@/providers").ILLMProvider, config: import("@/providers").ProviderConfig) => Promise<void>;
    waitForInput?: () => Promise<string>;
    getToken?: () => string;
    getUserName?: () => string | null;
    getConfiguredProviders?: () => import("@/providers").ProviderConfig[];
    saveUserConfig?: (update: { userName?: string | null; configuredProviders?: import("@/providers").ProviderConfig[] }) => Promise<void>;
    listRoles?: () => { name: string }[];
    getActiveRole?: () => string | null;
    setActiveRole?: (roleName: string) => boolean;
    deleteRole?: (roleName: string) => boolean;
    createRole?: () => Promise<void>;
    cancelActiveOperation?: () => boolean;
    setRenderEnabled?: (enabled: boolean) => void;
    getRateDelay?: () => number;
    setRateDelay?: (ms: number) => void;
    getCurrentSessionSnapshot?: () => { messages: import("@/agent/types").AgentMessage[]; sessionId: string; createdAt: string };
    loadSessionById?: (id: string) => Promise<import("@/cli/session-store").StoredSessionSnapshot | null>;
}

export interface CommandModule
{
    key: string;
    command: Command;
}

