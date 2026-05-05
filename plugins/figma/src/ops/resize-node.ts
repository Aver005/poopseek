import type { OpHandler } from "./types";
import type { FigmaOp } from "../types";
import { resolveNode } from "../helpers";

export const handler: OpHandler = {
    type: "resize_node",
    async execute(op, nodeMap): Promise<number> {
        const node = resolveNode(op.nodeId, nodeMap);
        if (node && "resize" in node) {
            const r = node as FrameNode | RectangleNode | EllipseNode;
            r.resize(
                op.width !== undefined ? Number(op.width) : r.width,
                op.height !== undefined ? Number(op.height) : r.height,
            );
        }
        return 1;
    },
};
