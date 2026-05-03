import type { Server } from "bun";
type BunServer = Server<unknown>;
import ContextManager from "@/agent/context-manager";
import StreamingAgentLoop from "@/agent/streaming-loop";
import ToolExecutor from "@/agent/tool-executor";
import { SubAgentRunner } from "@/agent/sub-agent";
import type { ToolExecutionResult } from "@/agent/types";
import type { ILLMProvider, ProviderCallOptions } from "@/providers";
import { createFigmaV2Registry, FIGMA_V2_STAGED_TOOLS_DOC } from "@/tools/defs/figma/v2";
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
import { buildRolePromptEnvelope, getRoleContextManager, getRoleLoop } from "@/figma/multi-session";
import { planPatchExistingRoot } from "@/figma/patch-planner";
import { buildPreprocessUserMessage, formatPreparedBrief, parsePreparedBriefText } from "@/figma/preprocess";
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
import type { ProviderMessage } from "@/providers/types";
import type { FigmaChatRequest, FigmaChatResponse, FigmaOp, FigmaRole, FigmaRoleSession, FigmaSession, FigmaSnapshotRequest } from "./types";
import type { FigmaPrimitiveDefinition } from "@/figma/artifact-types";

const DEFAULT_PORT = 7331;
const SESSION_TTL_MS = 60 * 60 * 1000;

export interface FigmaServerDeps
{
    getProvider: () => ILLMProvider;
    basePrompt: string;
    toolsPrompt: string;
    figmaPrompt: string;
    figmaStagePrompts: {
        preprocess: string;
        tokens: string;
        primitives: string;
        compose: string;
        repair: string;
        revision: string;
    };
    figmaRolePrompts: {
        enhancer: string;
        designer: string;
        builder: string;
        composer: string;
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

function isFigmaToolName(name: string): boolean
{
    return name.startsWith("figma.") || name.startsWith("figma_");
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

        const createRoleContextManager = (): ContextManager =>
            new ContextManager(
                this.deps.basePrompt,
                this.deps.toolsPrompt,
                { maxMessages: 64 },
                this.deps.variableProcessor,
            );

        const createRoleLoop = (contextManager: ContextManager): StreamingAgentLoop =>
            new StreamingAgentLoop(
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

        const enhancerContext = createRoleContextManager();
        const designerContext = createRoleContextManager();
        const builderContext = createRoleContextManager();
        const composerContext = createRoleContextManager();

        const roleSessions: Record<FigmaRole, FigmaRoleSession> = {
            enhancer: {
                role: "enhancer",
                contextManager: enhancerContext,
            },
            designer: {
                role: "designer",
                contextManager: designerContext,
                agentLoop: createRoleLoop(designerContext),
            },
            builder: {
                role: "builder",
                contextManager: builderContext,
                agentLoop: createRoleLoop(builderContext),
            },
            composer: {
                role: "composer",
                contextManager: composerContext,
                agentLoop: createRoleLoop(composerContext),
            },
        };

        const session: FigmaSession = {
            id,
            roleSessions,
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
            !isFigmaToolName(name) || allowed.has(name),
        );
    }

    private isToolAllowedForStage(session: FigmaSession | null, name: string): boolean
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

    private syncSessionRuntimeState(session: FigmaSession): void
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

    private resolveStagePrompt(stage: FigmaStage): string
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

    private async runOrchestratedTurn(session: FigmaSession, userMessage: string): Promise<string>
    {
        session.orchestration.lastUserPrompt = userMessage;
        session.orchestration.taskMode = inferTaskMode(session.orchestration.hasPresentedResult);
        session.orchestration.editIntent = inferEditIntent(userMessage, session.orchestration.hasPresentedResult);
        session.orchestration.layout = inferLayoutConstraints(userMessage, session.orchestration.layout);
        session.orchestration.currentBrief = await this.runEnhancer(session, userMessage);
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
        await this.runStageWithRetry(session, "tokens", userMessage, undefined, "designer");
        await this.runPrimitivesFlow(session, userMessage);
        const revisionStage = await this.runStageWithRetry(session, "revision", userMessage, undefined, "composer");
        const compileFailure = revisionStage.toolResults.find((entry) => entry.tool === "figma.compile" && !entry.result.ok);
        if (compileFailure)
            await this.runStageWithRetry(session, "repair", userMessage, compileFailure.result.output, "composer");

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

    private async runPrimitivesFlow(session: FigmaSession, userMessage: string): Promise<void>
    {
        await this.runStageWithRetry(session, "primitives-plan", userMessage, undefined, "builder");
        const planArtifactId = this.buildSnapshot(session).activePrimitivePlanArtifactId;
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
        this.syncSessionRuntimeState(session);

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
                    snapshot: this.buildSnapshot(session),
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

    private async runEnhancer(session: FigmaSession, userMessage: string)
    {
        const snapshot = this.buildSnapshot(session);
        const enhancerContext = getRoleContextManager(session, "enhancer");
        enhancerContext.clearHistory();
        const provider = await this.deps.getProvider().clone();
        const messages: ProviderMessage[] = [
            ...enhancerContext.getMessages().map((message) => ({
                role: message.role === "tool" ? "assistant" : message.role,
                content: message.content,
            })) as ProviderMessage[],
            {
                role: "user",
                content: buildPreprocessUserMessage({
                    userPrompt: userMessage,
                    taskMode: session.orchestration.taskMode,
                    snapshotSummary: snapshot.summary,
                    layout: session.orchestration.layout,
                }),
            },
        ];

        const chunks: string[] = [];
        for await (const chunk of provider.complete(
            messages,
            `${this.deps.figmaRolePrompts.enhancer.trim()}\n\n${this.deps.figmaStagePrompts.preprocess.trim()}`,
            { ...(this.deps.getCallOptions?.() ?? {}), thinkingEnabled: false, searchEnabled: false },
        ))
            chunks.push(chunk);

        const text = chunks.join("").trim();
        enhancerContext.addUser(userMessage);
        enhancerContext.addAssistant(text);
        return parsePreparedBriefText(text, userMessage, session.orchestration.layout);
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
