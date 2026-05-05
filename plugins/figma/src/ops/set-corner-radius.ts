import type { OpHandler } from "./types";
import type { FigmaOp } from "../types";
import { resolveNode, applyCornerRadii } from "../helpers";

export const handler: OpHandler = {
    type: "set_corner_radius",
    async execute(op, nodeMap): Promise<number> {
        const node = resolveNode(op.nodeId, nodeMap);
        if (node && "cornerRadius" in node) {
            (node as SceneNode & { cornerRadius: number }).cornerRadius = Number(op.cornerRadius ?? 0);
            applyCornerRadii(node as SceneNode, op);
        }
        return 1;
    },
};
