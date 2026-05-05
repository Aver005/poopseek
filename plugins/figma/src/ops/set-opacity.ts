import type { OpHandler } from "./types";
import type { FigmaOp } from "../types";
import { resolveNode } from "../helpers";

export const handler: OpHandler = {
    type: "set_opacity",
    async execute(op, nodeMap): Promise<number> {
        const node = resolveNode(op.nodeId, nodeMap);
        if (node && "opacity" in node) (node as BlendMixin).opacity = Number(op.opacity ?? 1);
        return 1;
    },
};
