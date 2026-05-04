import type { FigmaOp } from "@/figma/api/contracts";
import type { FigmaServerDeps } from "@/figma/application/server-deps";
import type { FigmaRuntimeSync } from "@/figma/application/session/runtime-sync";
import {
    runEnhancerSession,
    runStylerSession,
    runPrimitivesBuilderSession,
    runDesignerEditSession,
} from "@/figma/application/sub-agents/figma-sub-agents";
import type { DesignerToolCall } from "@/figma/application/sub-agents/figma-sub-agents";
import {
    inferEditIntent,
    inferLayoutConstraints,
    inferTaskMode,
} from "@/figma/application/orchestration";
import { compileJsx } from "@/figma/engine/jsx/jsx-compiler";
import { parseJsx, JsxParseError } from "@/figma/engine/jsx/jsx-parser";
import { assertValidJsx, formatJsxValidationErrors, JsxValidationException } from "@/figma/engine/jsx/jsx-validator";
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
        this.runtime.syncSessionRuntimeState(session);

        if (session.orchestration.taskMode === "revision")
            return this.runRevision(session, userMessage);

        return this.runInitialPipeline(session, userMessage);
    }

    private async runInitialPipeline(session: FigmaSession, userMessage: string): Promise<string>
    {
        session.orchestration.currentStage = "enhancing";
        this.runtime.syncSessionRuntimeState(session);
        const enhancedPrompt = await runEnhancerSession(this.deps, session, userMessage);
        session.orchestration.currentEnhancedPrompt = enhancedPrompt;

        session.orchestration.currentStage = "styling";
        this.runtime.syncSessionRuntimeState(session);
        const tokens = await runStylerSession(this.deps, session, enhancedPrompt);

        session.varStore.setTokens(tokens);
        session.dispatchOps([{ type: "set_variables", tokens }]);

        session.orchestration.currentStage = "building-primitives";
        this.runtime.syncSessionRuntimeState(session);
        const primitivesJsx = await runPrimitivesBuilderSession(this.deps, session, enhancedPrompt);

        session.orchestration.currentStage = "assembling";
        this.runtime.syncSessionRuntimeState(session);
        const frameJsx = this.assembleFrame(primitivesJsx, session.orchestration.layout);
        const ops = this.compileJsxToOps(frameJsx);
        session.buffer.reset();
        session.dispatchOps(ops);

        session.orchestration.hasPresentedResult = true;
        session.orchestration.currentStage = "idle";
        this.runtime.syncSessionRuntimeState(session);

        return [
            "Готово. Экран собран и отправлен в Figma.",
            `- mode: ${session.orchestration.taskMode}`,
            `- editIntent: ${session.orchestration.editIntent}`,
            `- tokens: ${tokens.length}`,
            `- enhancerSessionId: ${session.roleSessions.enhancer.sessionId}`,
            `- stylerSessionId: ${session.roleSessions.styler.sessionId}`,
            `- primitivesBuilderSessionId: ${session.roleSessions["primitives-builder"].sessionId}`,
        ].join("\n");
    }

    private async runRevision(session: FigmaSession, userMessage: string): Promise<string>
    {
        session.orchestration.currentStage = "revision";
        this.runtime.syncSessionRuntimeState(session);

        const toolCalls = await runDesignerEditSession(this.deps, session, userMessage);
        const ops = this.compileToolCallsToOps(toolCalls);
        if (ops.length > 0)
            session.dispatchOps(ops);

        session.orchestration.revisionCount += 1;
        session.orchestration.currentStage = "idle";
        this.runtime.syncSessionRuntimeState(session);

        return [
            "Готово. Дизайнер внёс правки в Figma.",
            `- mode: ${session.orchestration.taskMode}`,
            `- editIntent: ${session.orchestration.editIntent}`,
            `- toolCallCount: ${toolCalls.length}`,
            `- designerSessionId: ${session.roleSessions.designer.sessionId}`,
        ].join("\n");
    }

    private assembleFrame(primitivesJsx: string, layout: FigmaSession["orchestration"]["layout"]): string
    {
        const widthClass = layout.contentWidthPolicy === "full-bleed"
            ? "w-full"
            : `max-w-[${layout.maxContentWidth}px]`;
        const paddingClass = layout.horizontalPadding > 0
            ? `px-[${layout.horizontalPadding}px]`
            : "";
        const classes = ["min-h-dvh bg-background", widthClass, paddingClass]
            .filter(Boolean)
            .join(" ");

        return [
            `<Frame id="root-frame" name="Screen" className="${classes}">`,
            primitivesJsx
                .split("\n")
                .map((line) => `    ${line}`)
                .join("\n"),
            "</Frame>",
        ].join("\n");
    }

    private compileJsxToOps(jsx: string): FigmaOp[]
    {
        let ops: FigmaOp[];
        try
        {
            const nodes = parseJsx(jsx);
            assertValidJsx(nodes);
            ops = compileJsx(nodes) as FigmaOp[];
        }
        catch (error)
        {
            if (error instanceof JsxParseError)
                throw new Error(`JSX parse error @ ${error.loc.line}:${error.loc.column}: ${error.message}`);
            if (error instanceof JsxValidationException)
                throw new Error(formatJsxValidationErrors(error.errors));
            throw error instanceof Error ? error : new Error(String(error));
        }

        if (ops.length === 0)
            throw new Error("Compile produced 0 operations");

        return ops;
    }

    private compileToolCallsToOps(toolCalls: DesignerToolCall[]): FigmaOp[]
    {
        const ops: FigmaOp[] = [];

        for (const call of toolCalls)
        {
            switch (call.tool)
            {
                case "figma.set-inner":
                {
                    const id = call.args.id as string;
                    const source = call.args.source as string;
                    if (!id || !source) continue;
                    const childOps = this.compileJsxToOps(source);
                    ops.push({ type: "replace_children", nodeId: id, childOps });
                    break;
                }

                case "figma.set-outer":
                {
                    const source = call.args.source as string;
                    if (!source) continue;
                    const nodeOps = this.compileJsxToOps(source);
                    const id = call.args.id as string;
                    if (!id) continue;
                    ops.push({ type: "replace_node", nodeId: id, childOps: nodeOps });
                    break;
                }

                case "figma.remove":
                {
                    const id = call.args.id as string;
                    if (!id) continue;
                    ops.push({ type: "delete_node", nodeId: id });
                    break;
                }

                case "figma.find":
                {
                    const pattern = call.args.pattern as string;
                    if (!pattern) continue;
                    ops.push({ type: "find_nodes", pattern });
                    break;
                }

                case "figma.create-frame":
                {
                    const source = call.args.source as string;
                    if (!source) continue;
                    const frameOps = this.compileJsxToOps(source);
                    ops.push(...frameOps);
                    break;
                }
            }
        }

        return ops;
    }
}
