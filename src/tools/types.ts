import type { ToolExecutionResult } from "@/agent/types";
import type { SubAgentResult, SubAgentTask } from "@/agent/sub-agent";

export type { SubAgentTask, SubAgentResult };

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
    spawnSubAgent?: (task: SubAgentTask) => Promise<SubAgentResult>;
    spawnSubAgents?: (tasks: SubAgentTask[]) => Promise<SubAgentResult[]>;
}

export type ToolHandler = (
    args: Record<string, unknown>,
    context: ToolContext,
) => Promise<ToolExecutionResult>;
