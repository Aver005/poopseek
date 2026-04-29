import type ContextManager from "@/agent/context-manager";
import type StreamingAgentLoop from "@/agent/streaming-loop";

export interface FigmaOp
{
    type: string;
    [key: string]: unknown;
}

export interface FigmaChatRequest
{
    sessionId?: string;
    message: string;
}

export interface FigmaChatResponse
{
    sessionId: string;
    text: string;
    ops: FigmaOp[];
}

export interface FigmaSession
{
    id: string;
    contextManager: ContextManager;
    agentLoop: StreamingAgentLoop;
    createdAt: number;
    lastActivityAt: number;
}
