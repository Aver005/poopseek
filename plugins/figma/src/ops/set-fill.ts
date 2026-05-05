import type { OpHandler } from "./types";
import type { FigmaOp, ColorInput } from "../types";
import { resolveNode, solidPaint } from "../helpers";

export const handler: OpHandler = {
    type: "set_fill",
    async execute(op, nodeMap): Promise<number> {
        const node = resolveNode(op.nodeId, nodeMap);
        if (node && "fills" in node && op.color !== undefined) {
            const paint = await solidPaint(op.color as ColorInput);
            if (paint) (node as GeometryMixin).fills = [paint];
        }
        return 1;
    },
};
