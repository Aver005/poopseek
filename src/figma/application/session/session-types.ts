import type ContextManager from "@/agent/context-manager";
import type { FigmaOrchestrationState } from "@/figma/application/orchestration";
import type { CompileArtifactStore } from "@/figma/domain/artifacts/stores/compile-artifact-store";
import type { CompositionJsxStore } from "@/figma/domain/artifacts/stores/composition-jsx-store";
import type { CompositionMetaStore } from "@/figma/domain/artifacts/stores/composition-meta-store";
import type { PrimitiveJsxStore } from "@/figma/domain/artifacts/stores/primitive-jsx-store";
import type { PrimitivePlanStore } from "@/figma/domain/artifacts/stores/primitive-plan-store";
import type { TokensStore } from "@/figma/domain/artifacts/stores/tokens-store";
import type { JsxBuffer } from "@/figma/engine/jsx/jsx-buffer";
import type { VariableStore } from "@/figma/engine/theme/var-store";
import type { FigmaOp } from "@/figma/api/contracts";
import type { PreparedDesignBrief } from "@/figma/preprocess";

export interface FigmaPreparedBriefResponse
{
    brief: PreparedDesignBrief;
}

export type FigmaRole = "enhancer" | "designer" | "builder" | "composer";

export interface FigmaRoleSession
{
    role: FigmaRole;
    sessionId: string;
    contextManager: ContextManager;
}

export interface FigmaSession
{
    id: string;
    plannerSessionId: string;
    plannerContextManager: ContextManager;
    roleSessions: Record<FigmaRole, FigmaRoleSession>;
    buffer: JsxBuffer;
    varStore: VariableStore;
    tokensStore: TokensStore;
    primitivePlanStore: PrimitivePlanStore;
    primitiveJsxStore: PrimitiveJsxStore;
    compositionMetaStore: CompositionMetaStore;
    compositionJsxStore: CompositionJsxStore;
    compileArtifactStore: CompileArtifactStore;
    orchestration: FigmaOrchestrationState;
    dispatchOps: (ops: FigmaOp[]) => void;
    createdAt: number;
    lastActivityAt: number;
}
