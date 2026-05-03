import ContextManager from "@/agent/context-manager";
import StreamingAgentLoop from "@/agent/streaming-loop";
import ToolExecutor from "@/agent/tool-executor";
import { SubAgentRunner } from "@/agent/sub-agent";
import { createFigmaV2Registry } from "@/tools/defs/figma/v2";
import { webToolNames, webToolsRegistry } from "@/tools/web-tools";
import type { FigmaServerDeps } from "@/figma/application/server-deps";
import type { FigmaRuntimeSync } from "@/figma/application/session/runtime-sync";
import { JsxBuffer } from "@/figma/engine/jsx/jsx-buffer";
import { VariableStore } from "@/figma/engine/theme/var-store";
import { CompileArtifactStore } from "@/figma/domain/artifacts/stores/compile-artifact-store";
import { CompositionJsxStore } from "@/figma/domain/artifacts/stores/composition-jsx-store";
import { CompositionMetaStore } from "@/figma/domain/artifacts/stores/composition-meta-store";
import { PrimitiveJsxStore } from "@/figma/domain/artifacts/stores/primitive-jsx-store";
import { PrimitivePlanStore } from "@/figma/domain/artifacts/stores/primitive-plan-store";
import { TokensStore } from "@/figma/domain/artifacts/stores/tokens-store";
import type { FigmaOrchestrationState } from "@/figma/application/orchestration";
import type { FigmaOp } from "@/figma/api/contracts";
import type { FigmaRole, FigmaRoleSession, FigmaSession } from "@/figma/application/session/session-types";

export function createInitialOrchestrationState(): FigmaOrchestrationState
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

export function createFigmaSession(args: {
    deps: FigmaServerDeps;
    runtime: FigmaRuntimeSync;
    pendingOps: FigmaOp[];
    sessionId?: string;
}): FigmaSession
{
    const id = args.sessionId ?? crypto.randomUUID();
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
        const transformed = args.runtime.applyRenderPolicy(session, ops);
        args.pendingOps.push(...transformed);
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

    const webDoc = args.deps.getWebToolsDoc?.() ?? "";
    const subAgentRunner = new SubAgentRunner(() => args.deps.getProvider(), process.cwd());
    const toolExecutor = new ToolExecutor(
        process.cwd(),
        undefined,
        args.deps.getSkillContent,
        (name) =>
        {
            if (name in v2Registry && !args.runtime.isToolAllowedForStage(sessionRef.current, name))
                return undefined;
            return v2Registry[name]
                ?? (webDoc.trim() ? webToolsRegistry[name] : undefined);
        },
        () => [
            ...args.runtime.getVisibleFigmaToolNames(sessionRef.current, Object.keys(v2Registry)),
            ...(webDoc.trim() ? webToolNames : []),
        ],
        subAgentRunner,
    );

    const createRoleContextManager = (): ContextManager =>
        new ContextManager(
            args.deps.basePrompt,
            args.deps.toolsPrompt,
            { maxMessages: 64 },
            args.deps.variableProcessor,
        );

    const createRoleLoop = (contextManager: ContextManager): StreamingAgentLoop =>
        new StreamingAgentLoop(
            () => args.deps.getProvider(),
            contextManager,
            toolExecutor,
            {
                maxStepsPerTurn: 64,
                maxToolsPerStep: 24,
                getCallOptions: () => args.deps.getCallOptions?.() ?? {},
                getRequestDelay: () => args.deps.getRequestDelay?.() ?? 0,
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
    args.runtime.syncSessionRuntimeState(session);
    return session;
}

