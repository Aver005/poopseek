import type { Server } from "bun";
type BunServer = Server<unknown>;
import ContextManager from "@/agent/context-manager";
import StreamingAgentLoop from "@/agent/streaming-loop";
import ToolExecutor from "@/agent/tool-executor";
import { SubAgentRunner } from "@/agent/sub-agent";
import type { ToolExecutionResult } from "@/agent/types";
import type { ILLMProvider, ProviderCallOptions } from "@/providers";
import { createFigmaV2Registry, FIGMA_V2_TOOLS_DOC } from "@/tools/defs/figma/v2";
import { webToolNames, webToolsRegistry } from "@/tools/web-tools";
import type { VariableProcessor } from "@/variables";
import { JsxBuffer } from "@/figma/jsx-buffer";
import { VariableStore } from "@/figma/var-store";
import { TokensStore } from "@/figma/tokens-store";
import { PrimitivePlanStore } from "@/figma/primitive-plan-store";
import { PrimitiveJsxStore } from "@/figma/primitive-jsx-store";
import { CompositionMetaStore } from "@/figma/composition-meta-store";
import { CompositionJsxStore } from "@/figma/composition-jsx-store";
import { CompileArtifactStore } from "@/figma/compile-artifact-store";
import { planPatchExistingRoot } from "@/figma/patch-planner";
import {
    applyRenderPolicyToOps,
    buildDerivedSnapshot,
    buildStageSystemContext,
    buildStageUserMessage,
    getStageConfig,
    inferEditIntent,
    inferLayoutConstraints,
    inferTaskMode,
    summarizeStageSuccess,
    type FigmaDerivedSnapshot,
    type FigmaOrchestrationState,
    type FigmaStage,
} from "./orchestrator";
import type { FigmaChatRequest, FigmaChatResponse, FigmaOp, FigmaSession, FigmaSnapshotRequest } from "./types";

const DEFAULT_PORT = 7331;
const SESSION_TTL_MS = 60 * 60 * 1000;

export interface FigmaServerDeps
{
    getProvider: () => ILLMProvider;
    basePrompt: string;
    toolsPrompt: string;
    figmaPrompt: string;
    figmaStagePrompts: {
        tokens: string;
        primitives: string;
        compose: string;
        repair: string;
        revision: string;
    };
    variableProcessor: VariableProcessor;
    getCallOptions?: () => ProviderCallOptions;
    getRequestDelay?: () => number;
    getWebToolsDoc?: () => string;
    getAvailableSkillsHint?: () => string;
    getSkillContent?: (name: string) => string | null;
}

interface StageRunResult
{
    assistantText: string;
    usedTools: string[];
    toolResults: Array<{ tool: string; result: ToolExecutionResult }>;
}

function createInitialOrchestrationState(): FigmaOrchestrationState
{
    return {
        taskMode: "initial",
        editIntent: "new-screen",
        currentStage: "idle",
        hasPresentedResult: false,
        revisionCount: 0,
        lastUserPrompt: "",
        layout: {
            platform: "mobile",
            viewportWidth: 390,
            viewportHeight: 844,
            contentWidthPolicy: "inset",
            maxContentWidth: 390,
            horizontalPadding: 24,
        },
    };
}

function stringifyError(error: unknown): string
{
    return error instanceof Error ? error.message : String(error);
}

function formatToolFailures(results: Array<{ tool: string; result: ToolExecutionResult }>): string
{
    return results
        .filter((entry) => !entry.result.ok)
        .map((entry) => `- ${entry.tool}: ${entry.result.output}`)
        .join("\n");
}

export class FigmaServerManager
{
    readonly port: number;
    private server: BunServer | null = null;
    private readonly sessions = new Map<string, FigmaSession>();
    private readonly pendingOps: FigmaOp[] = [];
    private cleanupTimer: ReturnType<typeof setInterval> | null = null;
    private readonly deps: FigmaServerDeps;

    constructor(deps: FigmaServerDeps, port: number = DEFAULT_PORT)
    {
        this.deps = deps;
        this.port = port;
    }

    get isRunning(): boolean
    {
        return this.server !== null;
    }

    async start(): Promise<void>
    {
        if (this.server) return;
        this.server = Bun.serve({
            port: this.port,
            fetch: (req) => this.handleRequest(req),
        });
        this.cleanupTimer = setInterval(() => this.cleanupSessions(), 5 * 60 * 1000);
    }

    async stop(): Promise<void>
    {
        if (this.cleanupTimer)
        {
            clearInterval(this.cleanupTimer);
            this.cleanupTimer = null;
        }
        this.server?.stop();
        this.server = null;
        this.sessions.clear();
        this.pendingOps.length = 0;
    }

    private corsHeaders(): Record<string, string>
    {
        return {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
        };
    }

    private async handleRequest(req: Request): Promise<Response>
    {
        if (req.method === "OPTIONS")
            return new Response(null, { status: 204, headers: this.corsHeaders() });

        const url = new URL(req.url);

        if (req.method === "POST" && url.pathname === "/v1/chat")
            return this.handleChat(req);

        if (req.method === "POST" && url.pathname === "/v1/ops")
            return this.handlePushOps(req);

        if (req.method === "GET" && url.pathname === "/v1/poll-ops")
            return this.handlePollOps();

        if (req.method === "POST" && url.pathname === "/v1/snapshot")
            return this.handlePushSnapshot(req);

        if (req.method === "GET" && url.pathname === "/v1/status")
        {
            return Response.json(
                { ok: true, sessions: this.sessions.size },
                { headers: this.corsHeaders() },
            );
        }

        return new Response("Not Found", { status: 404, headers: this.corsHeaders() });
    }

    private async handlePushOps(req: Request): Promise<Response>
    {
        let body: { ops?: unknown };
        try { body = await req.json() as { ops?: unknown }; }
        catch { return Response.json({ error: "Invalid JSON" }, { status: 400, headers: this.corsHeaders() }); }
        if (Array.isArray(body.ops)) this.pendingOps.push(...(body.ops as FigmaOp[]));
        return Response.json({ ok: true }, { headers: this.corsHeaders() });
    }

    private handlePollOps(): Response
    {
        const ops = this.pendingOps.splice(0);
        return Response.json({ ops }, { headers: this.corsHeaders() });
    }

    private async handlePushSnapshot(req: Request): Promise<Response>
    {
        let body: FigmaSnapshotRequest;
        try
        {
            body = await req.json() as FigmaSnapshotRequest;
        }
        catch
        {
            return Response.json({ error: "Invalid JSON" }, { status: 400, headers: this.corsHeaders() });
        }

        if (!body.sessionId || !body.snapshot || !Array.isArray(body.snapshot.tree))
            return Response.json({ error: "sessionId and snapshot are required" }, { status: 400, headers: this.corsHeaders() });

        const session = this.sessions.get(body.sessionId);
        if (!session)
            return Response.json({ error: "Unknown session" }, { status: 404, headers: this.corsHeaders() });

        session.orchestration.pluginSnapshot = body.snapshot;
        session.lastActivityAt = Date.now();
        this.syncSessionRuntimeState(session);

        return Response.json({ ok: true }, { headers: this.corsHeaders() });
    }

    private async handleChat(req: Request): Promise<Response>
    {
        let body: FigmaChatRequest;
        try
        {
            body = await req.json() as FigmaChatRequest;
        }
        catch
        {
            return Response.json({ error: "Invalid JSON" }, { status: 400, headers: this.corsHeaders() });
        }

        if (!body.message?.trim())
            return Response.json({ error: "message is required" }, { status: 400, headers: this.corsHeaders() });

        const session = this.getOrCreateSession(body.sessionId);
        session.lastActivityAt = Date.now();

        try
        {
            const text = await this.runOrchestratedTurn(session, body.message.trim());
            const response: FigmaChatResponse = {
                sessionId: session.id,
                text,
                ops: [],
            };
            return Response.json(response, { headers: this.corsHeaders() });
        }
        catch (error)
        {
            return Response.json({ error: stringifyError(error) }, { status: 500, headers: this.corsHeaders() });
        }
    }

    private getOrCreateSession(sessionId?: string): FigmaSession
    {
        if (sessionId)
        {
            const existing = this.sessions.get(sessionId);
            if (existing) return existing;
        }

        const id = sessionId ?? crypto.randomUUID();
        const buffer = new JsxBuffer();
        const varStore = new VariableStore();
        const tokensStore = new TokensStore();
        const primitivePlanStore = new PrimitivePlanStore();
        const primitiveJsxStore = new PrimitiveJsxStore();
        const compositionMetaStore = new CompositionMetaStore();
        const compositionJsxStore = new CompositionJsxStore();
        const compileArtifactStore = new CompileArtifactStore();
        const orchestration = createInitialOrchestrationState();

        const sessionRef: { current: FigmaSession | null } = { current: null };
        const enqueueOps = (ops: FigmaOp[]) =>
        {
            const session = sessionRef.current;
            const transformed = this.applyRenderPolicy(session, ops);
            this.pendingOps.push(...transformed);
        };

        const v2Registry = createFigmaV2Registry(
            buffer,
            varStore,
            tokensStore,
            primitivePlanStore,
            primitiveJsxStore,
            compositionMetaStore,
            compositionJsxStore,
            compileArtifactStore,
            enqueueOps,
        );

        const webDoc = this.deps.getWebToolsDoc?.() ?? "";
        const subAgentRunner = new SubAgentRunner(() => this.deps.getProvider(), process.cwd());

        const contextManager = new ContextManager(
            this.deps.basePrompt,
            this.deps.toolsPrompt,
            { maxMessages: 64 },
            this.deps.variableProcessor,
        );

        const toolExecutor = new ToolExecutor(
            process.cwd(),
            undefined,
            this.deps.getSkillContent,
            (name) =>
            {
                if (name in v2Registry && !this.isToolAllowedForStage(sessionRef.current, name))
                    return undefined;
                return v2Registry[name]
                    ?? (webDoc.trim() ? webToolsRegistry[name] : undefined);
            },
            () => [
                ...this.getVisibleFigmaToolNames(sessionRef.current, Object.keys(v2Registry)),
                ...(webDoc.trim() ? webToolNames : []),
            ],
            subAgentRunner,
        );

        const agentLoop = new StreamingAgentLoop(
            () => this.deps.getProvider(),
            contextManager,
            toolExecutor,
            {
                maxStepsPerTurn: 64,
                maxToolsPerStep: 24,
                getCallOptions: () => this.deps.getCallOptions?.() ?? {},
                getRequestDelay: () => this.deps.getRequestDelay?.() ?? 0,
            },
        );

        const session: FigmaSession = {
            id,
            contextManager,
            agentLoop,
            buffer,
            varStore,
            tokensStore,
            primitivePlanStore,
            primitiveJsxStore,
            compositionMetaStore,
            compositionJsxStore,
            compileArtifactStore,
            orchestration,
            createdAt: Date.now(),
            lastActivityAt: Date.now(),
        };

        sessionRef.current = session;
        this.sessions.set(id, session);
        this.syncSessionRuntimeState(session);
        return session;
    }

    private applyRenderPolicy(session: FigmaSession | null, ops: FigmaOp[]): FigmaOp[]
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

    private buildSnapshot(session: FigmaSession): FigmaDerivedSnapshot
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

    private getVisibleFigmaToolNames(session: FigmaSession | null, allNames: string[]): string[]
    {
        if (!session) return allNames;
        const allowed = new Set(getStageConfig(
            session.orchestration.currentStage,
            session.orchestration.taskMode,
        ).allowedTools);
        if (session.orchestration.currentStage === "idle")
            return allNames;

        return allNames.filter((name) =>
            !name.startsWith("figma.")
            || allowed.has(name)
            || name === "figma_render"
            || name === "figma_compile"
            || name === "figma_tokens",
        );
    }

    private isToolAllowedForStage(session: FigmaSession | null, name: string): boolean
    {
        if (!session) return true;
        if (!name.startsWith("figma.")) return true;
        if (session.orchestration.currentStage === "idle") return true;

        const allowed = new Set(getStageConfig(
            session.orchestration.currentStage,
            session.orchestration.taskMode,
        ).allowedTools);

        return allowed.has(name);
    }

    private syncSessionRuntimeState(session: FigmaSession): void
    {
        const snapshot = this.buildSnapshot(session);
        session.contextManager.setFigmaContext(
            buildStageSystemContext({
                basePrompt: this.resolveStagePrompt(session.orchestration.currentStage),
                toolsDoc: FIGMA_V2_TOOLS_DOC,
                stage: session.orchestration.currentStage,
                mode: session.orchestration.taskMode,
                editIntent: session.orchestration.editIntent,
                snapshot,
                layout: session.orchestration.layout,
                availableSkillsHint: this.deps.getAvailableSkillsHint?.(),
            }),
        );
        session.contextManager.setAvailableSkillsHint(this.deps.getAvailableSkillsHint?.() ?? "");
        session.contextManager.setWebToolsDoc(this.deps.getWebToolsDoc?.() ?? "");
    }

    private resolveStagePrompt(stage: FigmaStage): string
    {
        if (stage === "tokens") return this.deps.figmaStagePrompts.tokens;
        if (stage === "primitives") return this.deps.figmaStagePrompts.primitives;
        if (stage === "compose") return this.deps.figmaStagePrompts.compose;
        if (stage === "repair") return this.deps.figmaStagePrompts.repair;
        if (stage === "revision") return this.deps.figmaStagePrompts.revision;
        return this.deps.figmaPrompt;
    }

    private async runOrchestratedTurn(session: FigmaSession, userMessage: string): Promise<string>
    {
        session.orchestration.lastUserPrompt = userMessage;
        session.orchestration.taskMode = inferTaskMode(session.orchestration.hasPresentedResult);
        session.orchestration.editIntent = inferEditIntent(userMessage, session.orchestration.hasPresentedResult);
        session.orchestration.layout = inferLayoutConstraints(userMessage, session.orchestration.layout);

        if (session.orchestration.taskMode === "initial")
            return this.runInitialFlow(session, userMessage);

        return this.runRevisionFlow(session, userMessage);
    }

    private async runInitialFlow(session: FigmaSession, userMessage: string): Promise<string>
    {
        const summaries: string[] = [];

        await this.runStageWithRetry(session, "tokens", userMessage);
        summaries.push(summarizeStageSuccess("tokens"));

        await this.runStageWithRetry(session, "primitives", userMessage);
        summaries.push(summarizeStageSuccess("primitives"));

        const composeStage = await this.runStageWithRetry(session, "compose", userMessage);
        const compileFailure = composeStage.toolResults.find((entry) => entry.tool === "figma.compile" && !entry.result.ok);
        if (compileFailure)
        {
            await this.runStageWithRetry(session, "repair", userMessage, compileFailure.result.output);
            summaries.push(summarizeStageSuccess("repair"));
        }
        else
        {
            summaries.push(summarizeStageSuccess("compose"));
        }

        session.orchestration.hasPresentedResult = true;
        session.orchestration.currentStage = "idle";
        const snapshot = this.buildSnapshot(session);
        session.orchestration.activeCompositionArtifactId = snapshot.activeCompositionArtifactId;
        session.orchestration.activeCompileArtifactId = snapshot.activeCompileArtifactId;
        this.syncSessionRuntimeState(session);

        const text = composeStage.assistantText.trim();
        return text.length > 0
            ? text
            : `${summaries.join(" ")} Активный режим: initial -> revision.`;
    }

    private async runRevisionFlow(session: FigmaSession, userMessage: string): Promise<string>
    {
        const revisionStage = await this.runStageWithRetry(session, "revision", userMessage);
        const compileFailure = revisionStage.toolResults.find((entry) => entry.tool === "figma.compile" && !entry.result.ok);
        if (compileFailure)
            await this.runStageWithRetry(session, "repair", userMessage, compileFailure.result.output);

        session.orchestration.hasPresentedResult = true;
        session.orchestration.revisionCount += 1;
        session.orchestration.currentStage = "idle";
        const snapshot = this.buildSnapshot(session);
        session.orchestration.activeCompositionArtifactId = snapshot.activeCompositionArtifactId;
        session.orchestration.activeCompileArtifactId = snapshot.activeCompileArtifactId;
        this.syncSessionRuntimeState(session);

        const text = revisionStage.assistantText.trim();
        return text.length > 0
            ? text
            : `${summarizeStageSuccess("revision")} editIntent=${session.orchestration.editIntent}.`;
    }

    private async runStageWithRetry(
        session: FigmaSession,
        stage: FigmaStage,
        userMessage: string,
        repairError?: string,
    ): Promise<StageRunResult>
    {
        let lastResult = await this.runStage(session, stage, userMessage, repairError);
        const requiredTools = getStageConfig(stage, session.orchestration.taskMode).requiredTools;
        const missing = requiredTools.filter((tool) => !lastResult.usedTools.includes(tool));
        const failedRequired = lastResult.toolResults.filter((entry) =>
            requiredTools.includes(entry.tool) && !entry.result.ok);

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

        lastResult = await this.runStage(session, stage, retryMessage, repairError ?? formatToolFailures(failedRequired));
        return lastResult;
    }

    private async runStage(
        session: FigmaSession,
        stage: FigmaStage,
        userMessage: string,
        repairError?: string,
    ): Promise<StageRunResult>
    {
        session.orchestration.currentStage = stage;
        this.syncSessionRuntimeState(session);

        const usedTools: string[] = [];
        const toolResults: Array<{ tool: string; result: ToolExecutionResult }> = [];

        const turn = await session.agentLoop.runTurn(
            buildStageUserMessage({
                stage,
                userPrompt: userMessage,
                snapshot: this.buildSnapshot(session),
                layout: session.orchestration.layout,
                repairError,
            }),
            {
                onToolDone: (toolName, result) =>
                {
                    usedTools.push(toolName);
                    toolResults.push({ tool: toolName, result });
                },
            },
        );

        const snapshot = this.buildSnapshot(session);
        session.orchestration.activeCompositionArtifactId = snapshot.activeCompositionArtifactId;
        session.orchestration.activeCompileArtifactId = snapshot.activeCompileArtifactId;
        this.syncSessionRuntimeState(session);

        return {
            assistantText: turn.assistantText,
            usedTools,
            toolResults,
        };
    }

    private cleanupSessions(): void
    {
        const now = Date.now();
        for (const [id, session] of this.sessions)
        {
            if (now - session.lastActivityAt > SESSION_TTL_MS)
                this.sessions.delete(id);
        }
    }
}
