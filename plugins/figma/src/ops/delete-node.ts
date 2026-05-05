import type { OpHandler } from "./types";
import type { FigmaOp } from "../types";
import { resolveNode } from "../helpers";

export const handler: OpHandler = {
    type: "delete_node",
    async execute(op, nodeMap): Promise<number> {
        const node = resolveNode(op.nodeId, nodeMap);
        if (node) {
            node.remove();
            if (typeof op.nodeId === "string") nodeMap.delete(op.nodeId);
        }
        return 1;
    },
};
