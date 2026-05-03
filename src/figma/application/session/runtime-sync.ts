import { FIGMA_V2_STAGED_TOOLS_DOC } from "@/tools/defs/figma/v2";
import type { FigmaServerDeps } from "@/figma/application/server-deps";
import {
    applyRenderPolicyToOps,
    buildDerivedSnapshot,
    buildStageSystemContext,
    getStageConfig,
    type FigmaDerivedSnapshot,
    type FigmaStage,
} from "@/figma/application/orchestration";
import { planPatchExistingRoot } from "@/figma/domain/plugin/patch-planner";
import { formatPreparedBrief } from "@/figma/preprocess";
import type { FigmaOp } from "@/figma/api/contracts";
import type { FigmaRole, FigmaSession } from "@/figma/application/session/session-types";

export function isFigmaToolName(name: string): boolean
{
    return name.startsWith("figma.") || name.startsWith("figma_");
}

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

    getVisibleFigmaToolNames(session: FigmaSession | null, allNames: string[]): string[]
    {
        if (!session) return allNames;
        const allowed = new Set(getStageConfig(
            session.orchestration.currentStage,
            session.orchestration.taskMode,
        ).allowedTools);
        if (session.orchestration.currentStage === "idle")
            return allNames;

        return allNames.filter((name) =>
            !isFigmaToolName(name) || allowed.has(name),
        );
    }

    isToolAllowedForStage(session: FigmaSession | null, name: string): boolean
    {
        if (!session) return true;
        if (!isFigmaToolName(name)) return true;
        if (session.orchestration.currentStage === "idle") return true;

        const allowed = new Set(getStageConfig(
            session.orchestration.currentStage,
            session.orchestration.taskMode,
        ).allowedTools);

        return allowed.has(name);
    }

    syncSessionRuntimeState(session: FigmaSession): void
    {
        const snapshot = this.buildSnapshot(session);
        const briefSummary = session.orchestration.currentBrief
            ? `\n\n## CURRENT BRIEF\n${formatPreparedBrief(session.orchestration.currentBrief)}`
            : "";
        const rolePromptByStage: Record<Exclude<FigmaRole, "enhancer">, string> = {
            designer: this.deps.figmaRolePrompts.designer,
            builder: this.deps.figmaRolePrompts.builder,
            composer: this.deps.figmaRolePrompts.composer,
        };
        const roleStageByRole: Record<Exclude<FigmaRole, "enhancer">, FigmaStage> = {
            designer: "tokens",
            builder: session.orchestration.currentStage === "primitive-jsx"
                ? "primitive-jsx"
                : session.orchestration.currentStage === "primitives-plan"
                    ? "primitives-plan"
                    : "primitives-plan",
            composer: session.orchestration.currentStage === "repair"
                ? "repair"
                : session.orchestration.taskMode === "revision"
                    ? "revision"
                    : "compose",
        };

        for (const role of ["designer", "builder", "composer"] as const)
        {
            const roleSession = session.roleSessions[role];
            const roleStage = roleStageByRole[role];
            roleSession.contextManager.setFigmaContext(
                buildStageSystemContext({
                    basePrompt: `${rolePromptByStage[role].trim()}\n\n${this.resolveStagePrompt(roleStage).trim()}`,
                    toolsDoc: FIGMA_V2_STAGED_TOOLS_DOC,
                    stage: roleStage,
                    mode: session.orchestration.taskMode,
                    editIntent: session.orchestration.editIntent,
                    snapshot,
                    layout: session.orchestration.layout,
                    availableSkillsHint: this.deps.getAvailableSkillsHint?.(),
                }) + briefSummary,
            );
            roleSession.contextManager.setAvailableSkillsHint(this.deps.getAvailableSkillsHint?.() ?? "");
            roleSession.contextManager.setWebToolsDoc(this.deps.getWebToolsDoc?.() ?? "");
        }

        session.roleSessions.enhancer.contextManager.setFigmaContext(
            `${this.deps.figmaRolePrompts.enhancer.trim()}\n\n${this.deps.figmaStagePrompts.preprocess.trim()}`,
        );
        session.roleSessions.enhancer.contextManager.setAvailableSkillsHint(this.deps.getAvailableSkillsHint?.() ?? "");
        session.roleSessions.enhancer.contextManager.setWebToolsDoc("");
    }

    resolveStagePrompt(stage: FigmaStage): string
    {
        if (stage === "tokens") return this.deps.figmaStagePrompts.tokens;
        if (stage === "primitives") return this.deps.figmaStagePrompts.primitives;
        if (stage === "primitives-plan") return this.deps.figmaStagePrompts.primitives;
        if (stage === "primitive-jsx") return this.deps.figmaStagePrompts.primitives;
        if (stage === "compose") return this.deps.figmaStagePrompts.compose;
        if (stage === "repair") return this.deps.figmaStagePrompts.repair;
        if (stage === "revision") return this.deps.figmaStagePrompts.revision;
        return this.deps.figmaPrompt;
    }
}

