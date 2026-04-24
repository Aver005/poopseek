export type AgentRole = "system" | "user" | "assistant" | "tool";

export interface AgentMessage
{
    role: AgentRole;
    content: string;
    name?: string;
}

export type ToolFlowAction =
    | "continue"
    | "stop"
    | "try-again"
    | "ignore"
    | "ask-user";

export interface ToolCallEnvelope
{
    tool: string;
    args: Record<string, unknown>;
    onError: ToolFlowAction;
    onSuccess: ToolFlowAction;
}

export interface ToolExecutionResult
{
    ok: boolean;
    output: string;
    data?: unknown;
    error?: string;
}

export interface AgentTurnResult
{
    assistantText: string;
    toolCalls: number;
}
