import type { ToolExecutionResult } from "@/agent/types";

export interface CommandResult
{
    code: number;
    stdout: string;
    stderr: string;
}

export type UserInputRequest =
    | { type: "text"; prompt: string }
    | { type: "choice"; title: string; options: string[] }
    | { type: "confirm"; question: string };

export type AskUserFn = (request: UserInputRequest) => Promise<string | null>;

export interface ToolContext
{
    workspaceRoot: string;
    getToolNames: () => string[];
    resolvePath: (inputPath: string) => string;
    runCommand: (
        kind: "powershell" | "bash",
        args: Record<string, unknown>,
    ) => Promise<CommandResult>;
    askUser: AskUserFn;
    getSkillContent?: (name: string) => string | null;
}

export type ToolHandler = (
    args: Record<string, unknown>,
    context: ToolContext,
) => Promise<ToolExecutionResult>;
