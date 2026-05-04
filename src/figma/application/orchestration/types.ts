import type { JsxBuffer } from "@/figma/engine/jsx/jsx-buffer";
import type { PreparedDesignBrief } from "@/figma/preprocess";
import type { FigmaPluginSnapshot } from "@/figma/domain/plugin/snapshot-types";
import type {
    FigmaCompileArtifact,
    FigmaCompositionJsxArtifact,
    FigmaCompositionMetaArtifact,
    FigmaPrimitivesJsxArtifact,
    FigmaPrimitivesPlanArtifact,
    FigmaTokensArtifact,
} from "@/figma/domain/artifacts/artifact-types";

export type FigmaTaskMode = "initial" | "revision";
export type FigmaEditIntent = "edit-existing" | "fork-variant" | "new-screen";
export type FigmaStage =
    | "idle"
    | "enhancing"
    | "styling"
    | "building-primitives"
    | "assembling"
    | "revision";
export type FigmaPlatform = "mobile" | "tablet" | "desktop";
export type ContentWidthPolicy = "full-bleed" | "inset" | "centered" | "split";

export interface LayoutConstraints
{
    platform: FigmaPlatform;
    viewportWidth: number;
    viewportHeight: number;
    contentWidthPolicy: ContentWidthPolicy;
    maxContentWidth: number;
    horizontalPadding: number;
}

export interface FigmaDerivedSnapshot
{
    source: "plugin" | "artifacts" | "buffer" | "empty";
    summary: string;
    invocationJsx?: string;
    expandedJsx?: string;
    activeTokensArtifactId?: string;
    activePrimitivePlanArtifactId?: string;
    activePrimitivesJsxArtifactId?: string;
    activeCompositionArtifactId?: string;
    activeCompositionJsxArtifactId?: string;
    activeCompileArtifactId?: string;
    activeRootNodeId?: string;
}

export interface FigmaOrchestrationState
{
    taskMode: FigmaTaskMode;
    editIntent: FigmaEditIntent;
    currentStage: FigmaStage;
    hasPresentedResult: boolean;
    revisionCount: number;
    lastUserPrompt: string;
    layout: LayoutConstraints;
    currentEnhancedPrompt?: string;
    currentBrief?: PreparedDesignBrief;
    pluginSnapshot?: FigmaPluginSnapshot;
    activeRootNodeId?: string;
    activeCompositionArtifactId?: string;
    activeCompileArtifactId?: string;
}

export interface FigmaOrchestratorStores
{
    buffer: JsxBuffer;
    tokens: FigmaTokensArtifact[];
    primitivePlans: FigmaPrimitivesPlanArtifact[];
    primitiveJsx: FigmaPrimitivesJsxArtifact[];
    compositionMeta: FigmaCompositionMetaArtifact[];
    compositionJsx: FigmaCompositionJsxArtifact[];
    compileArtifacts: FigmaCompileArtifact[];
}

export interface FigmaOpLike
{
    type?: unknown;
    id?: unknown;
    frameId?: unknown;
    nodeId?: unknown;
    [key: string]: unknown;
}
