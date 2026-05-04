import type ContextManager from "@/agent/context-manager";
import type { JsxBuffer } from "@/figma/engine/jsx/jsx-buffer";
import type { VariableStore } from "@/figma/engine/theme/var-store";
import type { FigmaOp } from "@/figma/api/contracts";
import type { FigmaPluginSnapshot } from "@/figma/domain/plugin/snapshot-types";

export type FigmaRole = "enhancer" | "styler" | "primitives-builder" | "designer";

export interface FigmaRoleSession
{
    role: FigmaRole;
    sessionId: string;
    contextManager: ContextManager;
}

export interface FigmaSession
{
    id: string;
    roleSessions: Record<FigmaRole, FigmaRoleSession>;
    buffer: JsxBuffer;
    varStore: VariableStore;
    dispatchOps: (ops: FigmaOp[]) => void;
    createdAt: number;
    lastActivityAt: number;
    mode: "create" | "edit";
    lastJsx: string;
    lastSnapshot: FigmaPluginSnapshot | null;
}
