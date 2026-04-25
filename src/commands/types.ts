export interface Command
{
    name: string;
    description: string;
    execute: (args: string[]) => Promise<boolean> | boolean;
}

export interface CommandsContext
{
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
    getTheme?: () => "dark" | "light";
    setTheme?: (theme: "dark" | "light") => void;
    getModelType?: () => "default" | "expert";
    setModelType?: (modelType: "default" | "expert") => void;
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
}

export interface CommandModule
{
    key: string;
    command: Command;
}
