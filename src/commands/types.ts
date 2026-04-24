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
    clearHistory?: () => void;
    getTheme?: () => "dark" | "light";
    setTheme?: (theme: "dark" | "light") => void;
    getModelType?: () => "default" | "expert";
    setModelType?: (modelType: "default" | "expert") => void;
}

export interface CommandModule
{
    key: string;
    command: Command;
}
