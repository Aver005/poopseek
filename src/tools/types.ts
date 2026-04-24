import type { ToolExecutionResult } from "@/agent/types";

export interface CommandResult
{
    code: number;
    stdout: string;
    stderr: string;
}

export interface ToolContext
{
    workspaceRoot: string;
    getToolNames: () => string[];
    resolvePath: (inputPath: string) => string;
    runCommand: (
        kind: "powershell" | "bash",
        args: Record<string, unknown>,
    ) => Promise<CommandResult>;
}

export type ToolHandler = (
    args: Record<string, unknown>,
    context: ToolContext,
) => Promise<ToolExecutionResult>;
