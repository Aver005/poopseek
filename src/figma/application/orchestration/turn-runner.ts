import type { FigmaServerDeps } from "@/figma/application/server-deps";
import type { FigmaRuntimeSync } from "@/figma/application/session/runtime-sync";
import {
    compileComposition,
    saveComposerOutput,
    saveDesignerOutput,
    savePlannerOutput,
    savePrimitiveJsx,
} from "@/figma/application/orchestration/artifact-pipeline";
import { runEnhancer } from "@/figma/application/enhancer/run-enhancer";
import {
    inferEditIntent,
    inferLayoutConstraints,
    inferTaskMode,
} from "@/figma/application/orchestration";
import {
    FigmaUserFacingError,
    runBuilderSession,
    runComposerSession,
    runDesignerSession,
    runPlannerSession,
} from "@/figma/application/sub-agents/figma-sub-agents";
import type { FigmaSession } from "@/figma/application/session/session-types";

export class FigmaTurnRunner
{
    constructor(
        private readonly deps: FigmaServerDeps,
        private readonly runtime: FigmaRuntimeSync,
    )
    {
    }

    async runOrchestratedTurn(session: FigmaSession, userMessage: string): Promise<string>
    {
        session.orchestration.lastUserPrompt = userMessage;
        session.orchestration.taskMode = inferTaskMode(session.orchestration.hasPresentedResult);
        session.orchestration.editIntent = inferEditIntent(userMessage, session.orchestration.hasPresentedResult);
        session.orchestration.layout = inferLayoutConstraints(userMessage, session.orchestration.layout);
        session.orchestration.currentEnhancedPrompt = await runEnhancer(this.deps, session, userMessage);
        this.runtime.syncSessionRuntimeState(session);

        return this.runMainPipeline(session, userMessage);
    }

    private async runMainPipeline(session: FigmaSession, userMessage: string): Promise<string>
    {
        const enhancedPrompt = session.orchestration.currentEnhancedPrompt ?? userMessage;

        session.orchestration.currentStage = "tokens";
        this.runtime.syncSessionRuntimeState(session);
        const design = await runDesignerSession(this.deps, session, userMessage, enhancedPrompt);
        const tokensArtifact = saveDesignerOutput(session, design);

        session.orchestration.currentStage = "primitives-plan";
        this.runtime.syncSessionRuntimeState(session);
        const planner = await runPlannerSession(this.deps, session, userMessage, enhancedPrompt, design);
        const primitivePlanArtifact = savePlannerOutput(session, tokensArtifact.id, planner, enhancedPrompt);
        session.orchestration.activeCompositionArtifactId = undefined;
        session.orchestration.activeCompileArtifactId = undefined;

        session.orchestration.currentStage = "primitive-jsx";
        for (const primitive of planner.primitives)
        {
            this.runtime.syncSessionRuntimeState(session);
            const latestJsxArtifact = session.primitiveJsxStore.findLatestByPlanId(primitivePlanArtifact.id);
            const builtPrimitiveNames = latestJsxArtifact?.entries.map((entry) => entry.name) ?? [];
            const jsx = await runBuilderSession({
                deps: this.deps,
                session,
                userMessage,
                enhancedPrompt,
                design,
                planner,
                primitive,
                builtPrimitiveNames,
            });
            savePrimitiveJsx(session, primitivePlanArtifact.id, primitive.name, jsx);
        }

        const primitivesJsxArtifact = session.primitiveJsxStore.findLatestByPlanId(primitivePlanArtifact.id);
        if (!primitivesJsxArtifact)
            throw new Error(`Primitives JSX artifact for "${primitivePlanArtifact.id}" was not created`);

        session.orchestration.currentStage = session.orchestration.taskMode === "revision" ? "revision" : "compose";
        this.runtime.syncSessionRuntimeState(session);
        let lastComposerError = "";

        for (let attempt = 1; attempt <= 3; attempt += 1)
        {
            const composition = await runComposerSession({
                deps: this.deps,
                session,
                userMessage,
                enhancedPrompt,
                design,
                planner,
                builtPrimitives: primitivesJsxArtifact.entries.map((entry) => ({ name: entry.name, jsx: entry.jsx })),
                compileError: lastComposerError || undefined,
            });

            try
            {
                const compositionArtifact = saveComposerOutput(
                    session,
                    tokensArtifact.id,
                    primitivePlanArtifact.id,
                    primitivesJsxArtifact.id,
                    composition,
                );
                session.orchestration.activeCompositionArtifactId = compositionArtifact.id;
                const compileArtifact = compileComposition(session, compositionArtifact.id);
                session.orchestration.activeCompileArtifactId = compileArtifact.id;
                session.orchestration.hasPresentedResult = true;
                session.orchestration.revisionCount += session.orchestration.taskMode === "revision" ? 1 : 0;
                session.orchestration.currentStage = "idle";
                this.runtime.syncSessionRuntimeState(session);

                return [
                    "Готово. Основной агент собрал экран и отправил его в Figma.",
                    `- mode: ${session.orchestration.taskMode}`,
                    `- editIntent: ${session.orchestration.editIntent}`,
                    `- screenName: ${planner.screenName}`,
                    `- tokensArtifactId: ${tokensArtifact.id}`,
                    `- primitivesArtifactId: ${primitivePlanArtifact.id}`,
                    `- primitivesJsxArtifactId: ${primitivesJsxArtifact.id}`,
                    `- compositionArtifactId: ${compositionArtifact.id}`,
                    `- compileArtifactId: ${compileArtifact.id}`,
                    `- plannerSessionId: ${session.plannerSessionId}`,
                    `- enhancerSessionId: ${session.roleSessions.enhancer.sessionId}`,
                    `- designerSessionId: ${session.roleSessions.designer.sessionId}`,
                    `- builderSessionId: ${session.roleSessions.builder.sessionId}`,
                    `- composerSessionId: ${session.roleSessions.composer.sessionId}`,
                ].join("\n");
            }
            catch (error)
            {
                lastComposerError = error instanceof Error ? error.message : String(error);
                if (attempt >= 3)
                {
                    throw new FigmaUserFacingError(
                        [
                            "Composer не смог собрать валидную композицию после 3 попыток.",
                            `Последняя ошибка: ${lastComposerError}`,
                            `plannerSessionId: ${session.plannerSessionId}`,
                            `enhancerSessionId: ${session.roleSessions.enhancer.sessionId}`,
                            `designerSessionId: ${session.roleSessions.designer.sessionId}`,
                            `builderSessionId: ${session.roleSessions.builder.sessionId}`,
                            `composerSessionId: ${session.roleSessions.composer.sessionId}`,
                        ].join("\n"),
                        {
                            planner: session.plannerSessionId,
                            enhancer: session.roleSessions.enhancer.sessionId,
                            designer: session.roleSessions.designer.sessionId,
                            builder: session.roleSessions.builder.sessionId,
                            composer: session.roleSessions.composer.sessionId,
                        },
                    );
                }
            }
        }

        throw new Error("Composer pipeline exited unexpectedly");
    }
}

