import type { FigmaServerDeps } from "@/figma/application/server-deps";
import {
    applyRenderPolicyToOps,
    buildDerivedSnapshot,
    type FigmaDerivedSnapshot,
} from "@/figma/application/orchestration";
import { planPatchExistingRoot } from "@/figma/domain/plugin/patch-planner";
import type { FigmaOp } from "@/figma/api/contracts";
import type { FigmaRole, FigmaSession } from "@/figma/application/session/session-types";

export class FigmaRuntimeSync
{
    constructor(private readonly deps: FigmaServerDeps)
    {
    }

    applyRenderPolicy(session: FigmaSession | null, ops: FigmaOp[]): FigmaOp[]
    {
        if (!session || ops.length === 0) return ops;

        const canPatchExistingRoot =
            session.orchestration.taskMode === "revision"
            && session.orchestration.editIntent === "edit-existing"
            && !!session.orchestration.pluginSnapshot;

        if (canPatchExistingRoot)
        {
            const patch = planPatchExistingRoot({
                ops,
                activeRootNodeId: session.orchestration.activeRootNodeId,
                pluginSnapshot: session.orchestration.pluginSnapshot,
            });

            if (patch.mode === "patched-root")
            {
                if (patch.reusedRootNodeId)
                    session.orchestration.activeRootNodeId = patch.reusedRootNodeId;
                return patch.ops;
            }
        }

        const result = applyRenderPolicyToOps(ops, session.orchestration);
        if (result.nextRootNodeId)
            session.orchestration.activeRootNodeId = result.nextRootNodeId;
        return result.ops as FigmaOp[];
    }

    buildSnapshot(session: FigmaSession): FigmaDerivedSnapshot
    {
        return buildDerivedSnapshot(
            {
                buffer: session.buffer,
                tokens: session.tokensStore.list(),
                primitivePlans: session.primitivePlanStore.list(),
                primitiveJsx: session.primitiveJsxStore.list(),
                compositionMeta: session.compositionMetaStore.list(),
                compositionJsx: session.compositionJsxStore.list(),
                compileArtifacts: session.compileArtifactStore.list(),
            },
            session.orchestration,
        );
    }

    syncSessionRuntimeState(session: FigmaSession): void
    {
        const snapshot = this.buildSnapshot(session);
        const enhancedPromptSummary = session.orchestration.currentEnhancedPrompt?.trim()
            ? `\n\n## ENHANCED PROMPT\n${session.orchestration.currentEnhancedPrompt.trim()}`
            : "";
        const rolePromptMap: Record<Exclude<FigmaRole, "enhancer">, string> = {
            designer: this.deps.figmaRolePrompts.designer,
            builder: this.deps.figmaRolePrompts.builder,
            composer: this.deps.figmaRolePrompts.composer,
        };

        for (const role of ["designer", "builder", "composer"] as const)
        {
            const roleSession = session.roleSessions[role];
            roleSession.contextManager.setFigmaContext(
                [
                    rolePromptMap[role].trim(),
                    "",
                    `## TASK MODE\n- taskMode: \`${session.orchestration.taskMode}\`\n- editIntent: \`${session.orchestration.editIntent}\`\n- stage: \`${session.orchestration.currentStage}\``,
                    "",
                    "## LAYOUT",
                    [
                        `- platform: ${session.orchestration.layout.platform}`,
                        `- viewport: ${session.orchestration.layout.viewportWidth}x${session.orchestration.layout.viewportHeight}`,
                        `- contentWidthPolicy: ${session.orchestration.layout.contentWidthPolicy}`,
                        `- maxContentWidth: ${session.orchestration.layout.maxContentWidth}`,
                        `- horizontalPadding: ${session.orchestration.layout.horizontalPadding}`,
                    ].join("\n"),
                    "",
                    "## SNAPSHOT",
                    snapshot.summary,
                    enhancedPromptSummary,
                ].join("\n"),
            );
            roleSession.contextManager.setAvailableSkillsHint(this.deps.getAvailableSkillsHint?.() ?? "");
            roleSession.contextManager.setWebToolsDoc("");
        }

        session.roleSessions.enhancer.contextManager.setFigmaContext(
            `${this.deps.figmaRolePrompts.enhancer.trim()}\n\n${this.deps.figmaStagePrompts.preprocess.trim()}`,
        );
        session.roleSessions.enhancer.contextManager.setAvailableSkillsHint(this.deps.getAvailableSkillsHint?.() ?? "");
        session.roleSessions.enhancer.contextManager.setWebToolsDoc("");
    }
}

