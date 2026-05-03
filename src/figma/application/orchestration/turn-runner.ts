import type { ToolExecutionResult } from "@/agent/types";
import type { FigmaServerDeps } from "@/figma/application/server-deps";
import type { FigmaRuntimeSync } from "@/figma/application/session/runtime-sync";
import { runEnhancer } from "@/figma/application/enhancer/run-enhancer";
import {
    buildStageUserMessage,
    getStageConfig,
    inferEditIntent,
    inferLayoutConstraints,
    inferTaskMode,
    summarizeStageSuccess,
    type FigmaStage,
} from "@/figma/application/orchestration";
import type { FigmaPrimitiveDefinition } from "@/figma/domain/artifacts/artifact-types";
import { buildRolePromptEnvelope, getRoleContextManager, getRoleLoop } from "@/figma/multi-session";
import type { FigmaSession } from "@/figma/application/session/session-types";

interface StageRunResult
{
    assistantText: string;
    usedTools: string[];
    toolResults: Array<{ tool: string; result: ToolExecutionResult }>;
}

function getStageFailures(
    requiredTools: string[],
    result: StageRunResult,
): { missing: string[]; failedRequired: Array<{ tool: string; result: ToolExecutionResult }> }
{
    return {
        missing: requiredTools.filter((tool) => !result.toolResults.some((entry) => entry.tool === tool && entry.result.ok)),
        failedRequired: result.toolResults.filter((entry) =>
            requiredTools.includes(entry.tool) && !entry.result.ok),
    };
}

function formatPrimitiveTargetContext(args: {
    primitivesArtifactId: string;
    primitive: FigmaPrimitiveDefinition;
    builtPrimitiveNames: string[];
}): string
{
    const { primitive } = args;
    return [
        `Build JSX only for primitive "${primitive.name}".`,
        `Call \`figma.primitives.jsx\` once with \`primitivesArtifactId: "${args.primitivesArtifactId}"\` and \`names: ["${primitive.name}"]\`.`,
        "Return exactly one matching fenced `jsx` block for that primitive.",
        "Do not include JSX for any other primitive in this chat.",
        "",
        "## Primitive target",
        `- name: ${primitive.name}`,
        `- level: ${primitive.level}`,
        primitive.description ? `- description: ${primitive.description}` : "",
        primitive.props.length > 0
            ? `- props: ${primitive.props.map((prop) => `${prop.name}${prop.required ? "!" : ""}`).join(", ")}`
            : "- props: none",
        primitive.dependencies.length > 0
            ? `- dependencies: ${primitive.dependencies.join(", ")}`
            : "- dependencies: none",
        args.builtPrimitiveNames.length > 0
            ? `- alreadyBuilt: ${args.builtPrimitiveNames.join(", ")}`
            : "- alreadyBuilt: none",
    ].filter(Boolean).join("\n");
}

function formatToolFailures(results: Array<{ tool: string; result: ToolExecutionResult }>): string
{
    return results
        .filter((entry) => !entry.result.ok)
        .map((entry) => `- ${entry.tool}: ${entry.result.output}`)
        .join("\n");
}

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
        session.orchestration.currentBrief = await runEnhancer(this.deps, this.runtime, session, userMessage);
        session.orchestration.editIntent = session.orchestration.currentBrief.editStrategy;

        if (session.orchestration.taskMode === "initial")
            return this.runInitialFlow(session, userMessage);

        return this.runRevisionFlow(session, userMessage);
    }

    private async runInitialFlow(session: FigmaSession, userMessage: string): Promise<string>
    {
        const summaries: string[] = [];

        await this.runStageWithRetry(session, "tokens", userMessage, undefined, "designer");
        summaries.push(summarizeStageSuccess("tokens"));

        await this.runPrimitivesFlow(session, userMessage);
        summaries.push(summarizeStageSuccess("primitives"));

        const composeStage = await this.runStageWithRetry(session, "compose", userMessage, undefined, "composer");
        const compileFailure = composeStage.toolResults.find((entry) => entry.tool === "figma.compile" && !entry.result.ok);
        if (compileFailure)
        {
            await this.runStageWithRetry(session, "repair", userMessage, compileFailure.result.output, "composer");
            summaries.push(summarizeStageSuccess("repair"));
        }
        else
        {
            summaries.push(summarizeStageSuccess("compose"));
        }

        session.orchestration.hasPresentedResult = true;
        session.orchestration.currentStage = "idle";
        const snapshot = this.runtime.buildSnapshot(session);
        session.orchestration.activeCompositionArtifactId = snapshot.activeCompositionArtifactId;
        session.orchestration.activeCompileArtifactId = snapshot.activeCompileArtifactId;
        this.runtime.syncSessionRuntimeState(session);

        const text = composeStage.assistantText.trim();
        return text.length > 0
            ? text
            : `${summaries.join(" ")} Активный режим: initial -> revision.`;
    }

    private async runRevisionFlow(session: FigmaSession, userMessage: string): Promise<string>
    {
        await this.runStageWithRetry(session, "tokens", userMessage, undefined, "designer");
        await this.runPrimitivesFlow(session, userMessage);
        const revisionStage = await this.runStageWithRetry(session, "revision", userMessage, undefined, "composer");
        const compileFailure = revisionStage.toolResults.find((entry) => entry.tool === "figma.compile" && !entry.result.ok);
        if (compileFailure)
            await this.runStageWithRetry(session, "repair", userMessage, compileFailure.result.output, "composer");

        session.orchestration.hasPresentedResult = true;
        session.orchestration.revisionCount += 1;
        session.orchestration.currentStage = "idle";
        const snapshot = this.runtime.buildSnapshot(session);
        session.orchestration.activeCompositionArtifactId = snapshot.activeCompositionArtifactId;
        session.orchestration.activeCompileArtifactId = snapshot.activeCompileArtifactId;
        this.runtime.syncSessionRuntimeState(session);

        const text = revisionStage.assistantText.trim();
        return text.length > 0
            ? text
            : `${summarizeStageSuccess("revision")} editIntent=${session.orchestration.editIntent}.`;
    }

    private async runPrimitivesFlow(session: FigmaSession, userMessage: string): Promise<void>
    {
        await this.runStageWithRetry(session, "primitives-plan", userMessage, undefined, "builder");
        const planArtifactId = this.runtime.buildSnapshot(session).activePrimitivePlanArtifactId;
        if (!planArtifactId)
            throw new Error("Primitives plan artifact was not created");

        const planArtifact = session.primitivePlanStore.get(planArtifactId);
        if (!planArtifact)
            throw new Error(`Primitives plan "${planArtifactId}" not found after plan stage`);

        for (const primitive of planArtifact.entries)
        {
            const latestJsxArtifact = session.primitiveJsxStore.findLatestByPlanId(planArtifactId);
            const builtPrimitiveNames = latestJsxArtifact?.entries.map((entry) => entry.name) ?? [];
            await this.runStageWithRetry(
                session,
                "primitive-jsx",
                userMessage,
                undefined,
                "builder",
                formatPrimitiveTargetContext({
                    primitivesArtifactId: planArtifactId,
                    primitive,
                    builtPrimitiveNames,
                }),
            );
        }

        const finalJsxArtifact = session.primitiveJsxStore.findLatestByPlanId(planArtifactId);
        if (!finalJsxArtifact)
            throw new Error(`Primitives JSX artifact for "${planArtifactId}" was not created`);

        const builtNames = new Set(finalJsxArtifact.entries.map((entry) => entry.name));
        const missing = planArtifact.entries
            .map((entry) => entry.name)
            .filter((name) => !builtNames.has(name));

        if (missing.length > 0)
            throw new Error(`Missing primitive JSX entries after isolated builds: ${missing.join(", ")}`);
    }

    private async runStageWithRetry(
        session: FigmaSession,
        stage: FigmaStage,
        userMessage: string,
        repairError?: string,
        role: "designer" | "builder" | "composer" = "composer",
        extraContext?: string,
    ): Promise<StageRunResult>
    {
        let lastResult = await this.runStage(session, stage, userMessage, repairError, role, extraContext);
        const requiredTools = getStageConfig(stage, session.orchestration.taskMode).requiredTools;
        let { missing, failedRequired } = getStageFailures(requiredTools, lastResult);

        if (missing.length === 0 && failedRequired.length === 0)
            return lastResult;

        const retryMessage = [
            userMessage,
            "",
            "## Stage enforcement",
            missing.length > 0
                ? `Ты не вызвал обязательные инструменты: ${missing.join(", ")}`
                : "Обязательные инструменты были вызваны, но один или несколько завершились ошибкой.",
            failedRequired.length > 0 ? `Ошибки:\n${formatToolFailures(failedRequired)}` : "",
        ].filter(Boolean).join("\n");

        lastResult = await this.runStage(session, stage, retryMessage, repairError ?? formatToolFailures(failedRequired), role, extraContext);
        ({ missing, failedRequired } = getStageFailures(requiredTools, lastResult));
        if (missing.length > 0 || failedRequired.length > 0)
        {
            throw new Error([
                `Stage "${stage}" failed.`,
                missing.length > 0 ? `Missing required tools: ${missing.join(", ")}` : "",
                failedRequired.length > 0 ? `Tool failures:\n${formatToolFailures(failedRequired)}` : "",
            ].filter(Boolean).join("\n"));
        }
        return lastResult;
    }

    private async runStage(
        session: FigmaSession,
        stage: FigmaStage,
        userMessage: string,
        repairError?: string,
        role: "designer" | "builder" | "composer" = "composer",
        extraContext?: string,
    ): Promise<StageRunResult>
    {
        session.orchestration.currentStage = stage;
        getRoleContextManager(session, role).clearHistory();
        this.runtime.syncSessionRuntimeState(session);

        const usedTools: string[] = [];
        const toolResults: Array<{ tool: string; result: ToolExecutionResult }> = [];
        const requiredTools = getStageConfig(stage, session.orchestration.taskMode).requiredTools;

        const turn = await getRoleLoop(session, role).runTurn(
            buildRolePromptEnvelope({
                role,
                userPrompt: buildStageUserMessage({
                    stage,
                    userPrompt: userMessage,
                    designBrief: session.orchestration.currentBrief,
                    snapshot: this.runtime.buildSnapshot(session),
                    layout: session.orchestration.layout,
                    repairError,
                    extraContext,
                }),
                brief: session.orchestration.currentBrief,
            }),
            {
                onToolDone: (toolName, result) =>
                {
                    usedTools.push(toolName);
                    toolResults.push({ tool: toolName, result });
                },
                shouldStopLoop: () =>
                {
                    if (requiredTools.length === 0) return false;
                    return requiredTools.every((tool) =>
                        toolResults.some((entry) => entry.tool === tool && entry.result.ok));
                },
            },
        );

        const snapshot = this.runtime.buildSnapshot(session);
        session.orchestration.activeCompositionArtifactId = snapshot.activeCompositionArtifactId;
        session.orchestration.activeCompileArtifactId = snapshot.activeCompileArtifactId;
        this.runtime.syncSessionRuntimeState(session);

        return {
            assistantText: turn.assistantText,
            usedTools,
            toolResults,
        };
    }
}

