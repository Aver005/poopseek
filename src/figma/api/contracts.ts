import type { FigmaPluginSnapshot } from "@/figma/domain/plugin/snapshot-types";

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

export interface FigmaSnapshotRequest
{
    sessionId: string;
    snapshot: FigmaPluginSnapshot;
}
