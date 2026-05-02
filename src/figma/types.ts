import type ContextManager from "@/agent/context-manager";
import type StreamingAgentLoop from "@/agent/streaming-loop";
import type { JsxBuffer } from "@/figma/jsx-buffer";
import type { VariableStore } from "@/figma/var-store";
import type { TokensStore } from "@/figma/tokens-store";
import type { PrimitivePlanStore } from "@/figma/primitive-plan-store";
import type { PrimitiveJsxStore } from "@/figma/primitive-jsx-store";
import type { CompositionMetaStore } from "@/figma/composition-meta-store";
import type { CompositionJsxStore } from "@/figma/composition-jsx-store";
import type { CompileArtifactStore } from "@/figma/compile-artifact-store";
import type { FigmaOrchestrationState } from "@/figma/orchestrator";
import type { FigmaPluginSnapshot } from "@/figma/snapshot-types";

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

export interface FigmaSession
{
    id: string;
    contextManager: ContextManager;
    agentLoop: StreamingAgentLoop;
    buffer: JsxBuffer;
    varStore: VariableStore;
    tokensStore: TokensStore;
    primitivePlanStore: PrimitivePlanStore;
    primitiveJsxStore: PrimitiveJsxStore;
    compositionMetaStore: CompositionMetaStore;
    compositionJsxStore: CompositionJsxStore;
    compileArtifactStore: CompileArtifactStore;
    orchestration: FigmaOrchestrationState;
    createdAt: number;
    lastActivityAt: number;
}
