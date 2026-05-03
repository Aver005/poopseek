export type AgentRole = "user" | "assistant" | "tool";

export interface AgentMessage
{
    role: AgentRole;
    content: string;
    name?: string;
}

export interface ToolCallEnvelope
{
    tool: string;
    args: Record<string, unknown>;
    attachments?: ToolCallAttachment[];
}

export interface ToolCallAttachment
{
    kind: "jsx";
    content: string;
    label?: string;
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
