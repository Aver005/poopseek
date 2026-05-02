import type ContextManager from "@/agent/context-manager";
import type StreamingAgentLoop from "@/agent/streaming-loop";
import type { JsxBuffer } from "@/figma/jsx-buffer";
import type { VariableStore } from "@/figma/var-store";

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
    buffer: JsxBuffer;
    varStore: VariableStore;
    createdAt: number;
    lastActivityAt: number;
}
