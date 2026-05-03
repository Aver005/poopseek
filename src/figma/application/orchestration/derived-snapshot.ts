import { renderCompositionInvocationJsx } from "@/figma/engine/composition/materializer";
import type {
    FigmaCompileArtifact,
    FigmaCompositionJsxArtifact,
    FigmaCompositionMetaArtifact,
    FigmaPrimitivesJsxArtifact,
    FigmaPrimitivesPlanArtifact,
    FigmaTokensArtifact,
} from "@/figma/domain/artifacts/artifact-types";
import type { FigmaDerivedSnapshot, FigmaOrchestrationState, FigmaOrchestratorStores } from "./types";

function lastOf<T>(items: T[]): T | undefined
{
    return items.length > 0 ? items[items.length - 1] : undefined;
}

export function buildDerivedSnapshot(
    stores: FigmaOrchestratorStores,
    orchestration: FigmaOrchestrationState,
): FigmaDerivedSnapshot
{
    const latestTokens: FigmaTokensArtifact | undefined = lastOf(stores.tokens);
    const latestPlan: FigmaPrimitivesPlanArtifact | undefined = lastOf(stores.primitivePlans);
    const latestPrimitivesJsx: FigmaPrimitivesJsxArtifact | undefined = lastOf(stores.primitiveJsx);
    const latestCompositionMeta: FigmaCompositionMetaArtifact | undefined = lastOf(stores.compositionMeta);
    const latestCompositionJsx: FigmaCompositionJsxArtifact | undefined = lastOf(stores.compositionJsx);
    const latestCompile: FigmaCompileArtifact | undefined = lastOf(stores.compileArtifacts);
    const latestTokensId = latestTokens?.id;
    const latestPlanId = latestPlan?.id;
    const latestPrimitivesJsxId = latestPrimitivesJsx?.id;
    const latestCompositionMetaId = latestCompositionMeta?.id;
    const latestCompositionJsxId = latestCompositionJsx?.id;
    const latestCompileId = latestCompile?.id;
    const pluginSnapshot = orchestration.pluginSnapshot;
    if (pluginSnapshot)
    {
        return {
            source: "plugin",
            summary: [
                "- snapshot source: plugin",
                `- nodeCount: ${pluginSnapshot.nodeCount}`,
                `- selectedNodeIds: ${pluginSnapshot.selectedNodeIds.join(", ") || "none"}`,
                `- activeRootNodeId: ${orchestration.activeRootNodeId ?? "none"}`,
            ].join("\n"),
            invocationJsx: pluginSnapshot.jsx,
            activeTokensArtifactId: latestTokensId,
            activePrimitivePlanArtifactId: latestPlanId,
            activePrimitivesJsxArtifactId: latestPrimitivesJsxId,
            activeCompositionArtifactId: orchestration.activeCompositionArtifactId,
            activeCompositionJsxArtifactId: latestCompositionJsxId,
            activeCompileArtifactId: orchestration.activeCompileArtifactId,
            activeRootNodeId: orchestration.activeRootNodeId,
        };
    }

    if (latestCompositionMeta || latestCompile)
    {
        const invocationJsx = latestCompositionJsx?.jsx ?? (latestCompositionMeta ? renderCompositionInvocationJsx(latestCompositionMeta) : undefined);

        return {
            source: "artifacts",
            summary: [
                `- tokens: ${latestTokens?.id ?? "none"}`,
                `- primitives.plan: ${latestPlan?.id ?? "none"}`,
                `- primitives.jsx: ${latestPrimitivesJsx?.id ?? "none"}`,
                `- compose.meta: ${latestCompositionMeta?.id ?? "none"}`,
                `- compose.jsx: ${latestCompositionJsx?.id ?? "none"}`,
                `- compile: ${latestCompile?.id ?? "none"}`,
                `- activeRootNodeId: ${orchestration.activeRootNodeId ?? "none"}`,
            ].join("\n"),
            invocationJsx,
            expandedJsx: latestCompile?.expandedJsx,
            activeTokensArtifactId: latestTokensId,
            activePrimitivePlanArtifactId: latestPlanId,
            activePrimitivesJsxArtifactId: latestPrimitivesJsxId,
            activeCompositionArtifactId: latestCompositionMetaId,
            activeCompositionJsxArtifactId: latestCompositionJsxId,
            activeCompileArtifactId: latestCompileId,
            activeRootNodeId: orchestration.activeRootNodeId,
        };
    }

    const bufferJsx = stores.buffer.toJsx().trim();
    if (bufferJsx.length > 0)
    {
        return {
            source: "buffer",
            summary: `- buffer has ${stores.buffer.size} node(s)`,
            invocationJsx: bufferJsx,
            activeTokensArtifactId: latestTokensId,
            activePrimitivePlanArtifactId: latestPlanId,
            activePrimitivesJsxArtifactId: latestPrimitivesJsxId,
            activeCompositionArtifactId: latestCompositionMetaId,
            activeCompositionJsxArtifactId: latestCompositionJsxId,
            activeCompileArtifactId: latestCompileId,
            activeRootNodeId: orchestration.activeRootNodeId,
        };
    }

    return {
        source: "empty",
        summary: [
            "- no current screen/artifacts",
            `- tokens: ${latestTokensId ?? "none"}`,
            `- primitives.plan: ${latestPlanId ?? "none"}`,
            `- primitives.jsx: ${latestPrimitivesJsxId ?? "none"}`,
            `- compose.meta: ${latestCompositionMetaId ?? "none"}`,
            `- compose.jsx: ${latestCompositionJsxId ?? "none"}`,
            `- compile: ${latestCompileId ?? "none"}`,
        ].join("\n"),
        activeTokensArtifactId: latestTokensId,
        activePrimitivePlanArtifactId: latestPlanId,
        activePrimitivesJsxArtifactId: latestPrimitivesJsxId,
        activeCompositionArtifactId: latestCompositionMetaId,
        activeCompositionJsxArtifactId: latestCompositionJsxId,
        activeCompileArtifactId: latestCompileId,
        activeRootNodeId: orchestration.activeRootNodeId,
    };
}
