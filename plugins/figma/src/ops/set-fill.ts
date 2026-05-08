import type { OpHandler } from "./types";
import { resolveNode, solidPaintWithBinding } from "../helpers";

export const handler: OpHandler = {
    type: "set_fill",
    async execute(op, nodeMap): Promise<number> {
        const node = resolveNode(op.nodeId, nodeMap);
        if (node && "fills" in node && typeof op.color === "string") {
            const varName = typeof op.colorVariableName === "string" ? op.colorVariableName : undefined;
            const paint = await solidPaintWithBinding(op.color, varName);
            if (paint) (node as GeometryMixin).fills = [paint];
        }
        return 1;
    },
};
