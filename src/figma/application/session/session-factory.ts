import ContextManager from "@/agent/context-manager";
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
    const dispatchOps = (ops: FigmaOp[]) =>
    {
        const session = sessionRef.current;
        const transformed = args.runtime.applyRenderPolicy(session, ops);
        args.pendingOps.push(...transformed);
    };

    const createRoleContextManager = (): ContextManager =>
        new ContextManager(
            args.deps.basePrompt,
            args.deps.toolsPrompt,
            { maxMessages: 64 },
            args.deps.variableProcessor,
        );
    const plannerContext = createRoleContextManager();
    const enhancerContext = createRoleContextManager();
    const designerContext = createRoleContextManager();
    const builderContext = createRoleContextManager();
    const composerContext = createRoleContextManager();

    const roleSessions: Record<FigmaRole, FigmaRoleSession> = {
        enhancer: {
            role: "enhancer",
            sessionId: `${id}:enhancer`,
            contextManager: enhancerContext,
        },
        designer: {
            role: "designer",
            sessionId: `${id}:designer`,
            contextManager: designerContext,
        },
        builder: {
            role: "builder",
            sessionId: `${id}:builder`,
            contextManager: builderContext,
        },
        composer: {
            role: "composer",
            sessionId: `${id}:composer`,
            contextManager: composerContext,
        },
    };

    const session: FigmaSession = {
        id,
        plannerSessionId: `${id}:planner`,
        plannerContextManager: plannerContext,
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
        dispatchOps,
        createdAt: Date.now(),
        lastActivityAt: Date.now(),
    };

    sessionRef.current = session;
    args.runtime.syncSessionRuntimeState(session);
    return session;
}

