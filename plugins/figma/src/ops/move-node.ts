import type { OpHandler } from "./types";
import type { FigmaOp } from "../types";
import { resolveNode } from "../helpers";

export const handler: OpHandler = {
    type: "move_node",
    async execute(op, nodeMap): Promise<number> {
        const node = resolveNode(op.nodeId, nodeMap);
        if (node && "x" in node) {
            if (op.x !== undefined) (node as { x: number }).x = Number(op.x);
            if (op.y !== undefined) (node as { y: number }).y = Number(op.y);
        }
        return 1;
    },
};
