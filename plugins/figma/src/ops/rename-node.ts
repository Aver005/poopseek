import type { OpHandler } from "./types";
import type { FigmaOp } from "../types";
import { resolveNode } from "../helpers";

export const handler: OpHandler = {
    type: "rename_node",
    async execute(op, nodeMap): Promise<number> {
        const node = resolveNode(op.nodeId, nodeMap);
        if (node && "name" in node) node.name = String(op.name ?? "");
        return 1;
    },
};
