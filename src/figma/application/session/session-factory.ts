import ContextManager from "@/agent/context-manager";
import type { FigmaServerDeps } from "@/figma/application/server-deps";
import { JsxBuffer } from "@/figma/engine/jsx/jsx-buffer";
import { VariableStore } from "@/figma/engine/theme/var-store";
import type { FigmaOp } from "@/figma/api/contracts";
import type { FigmaRole, FigmaRoleSession, FigmaSession } from "@/figma/application/session/session-types";

export function createFigmaSession(args: {
    deps: FigmaServerDeps;
    pendingOps: FigmaOp[];
    sessionId?: string;
}): FigmaSession
{
    const id = args.sessionId ?? crypto.randomUUID();
    const buffer = new JsxBuffer();
    const varStore = new VariableStore();

    const dispatchOps = (ops: FigmaOp[]) => args.pendingOps.push(...ops);

    const createRoleContextManager = (): ContextManager =>
        new ContextManager(
            args.deps.basePrompt,
            args.deps.toolsPrompt,
            { maxMessages: 64 },
            args.deps.variableProcessor,
        );

    const roleSessions: Record<FigmaRole, FigmaRoleSession> = {
        enhancer: {
            role: "enhancer",
            sessionId: `${id}:enhancer`,
            contextManager: createRoleContextManager(),
        },
        styler: {
            role: "styler",
            sessionId: `${id}:styler`,
            contextManager: createRoleContextManager(),
        },
        "primitives-builder": {
            role: "primitives-builder",
            sessionId: `${id}:primitives-builder`,
            contextManager: createRoleContextManager(),
        },
        designer: {
            role: "designer",
            sessionId: `${id}:designer`,
            contextManager: createRoleContextManager(),
        },
    };

    return {
        id,
        roleSessions,
        buffer,
        varStore,
        dispatchOps,
        createdAt: Date.now(),
        lastActivityAt: Date.now(),
        mode: "create",
        lastJsx: "",
        lastSnapshot: null,
        documentName: "",
        historyLoaded: false,
    };
}

