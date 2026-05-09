import type { FigmaPluginSnapshot } from "@/figma/domain/plugin/snapshot-types";
import type { ChatImage } from "@/figma/domain/image-analysis";

export type { ChatImage };

export interface FigmaOp
{
    type: string;
    [key: string]: unknown;
}

export interface FigmaChatRequest
{
    sessionId?: string;
    message: string;
    images?: ChatImage[];
}

export interface FigmaChatResponse
{
    sessionId: string;
    text: string;
    ops: FigmaOp[];
    agentSessions?: Record<string, string>;
}

export interface FigmaSnapshotRequest
{
    sessionId?: string;
    snapshot: FigmaPluginSnapshot;
}
