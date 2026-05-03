import type { FigmaOrchestrationState, FigmaOpLike } from "./types";

export function extractRootNodeIdFromOps(ops: Array<{ type?: unknown; id?: unknown; frameId?: unknown }>): string | undefined
{
    const rootCreate = ops.find((op) => op.type === "create_frame" && op.frameId === undefined);
    return typeof rootCreate?.id === "string" ? rootCreate.id : undefined;
}

export function applyRenderPolicyToOps(
    ops: FigmaOpLike[],
    orchestration: Pick<FigmaOrchestrationState, "taskMode" | "editIntent" | "activeRootNodeId">,
): { ops: FigmaOpLike[]; nextRootNodeId?: string }
{
    const nextRootNodeId = extractRootNodeIdFromOps(ops);
    const shouldReplaceCurrent =
        orchestration.taskMode === "revision" &&
        orchestration.editIntent === "edit-existing" &&
        !!orchestration.activeRootNodeId;

    return {
        ops: shouldReplaceCurrent
            ? [{ type: "delete_node", nodeId: orchestration.activeRootNodeId }, ...ops]
            : [...ops],
        nextRootNodeId,
    };
}
