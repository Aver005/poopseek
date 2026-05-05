import type { OpHandler } from "./types";
import type { FigmaOp, ColorInput } from "../types";
import { resolveNode, solidPaint } from "../helpers";

export const handler: OpHandler = {
    type: "set_stroke",
    async execute(op, nodeMap): Promise<number> {
        const node = resolveNode(op.nodeId, nodeMap);
        if (node && "strokes" in node && op.color !== undefined) {
            const paint = await solidPaint(op.color as ColorInput);
            if (paint) {
                (node as GeometryMixin).strokes = [paint];
                if (op.weight !== undefined) (node as GeometryMixin).strokeWeight = Number(op.weight);
                if (op.align) (node as GeometryMixin).strokeAlign = String(op.align) as "INSIDE" | "OUTSIDE" | "CENTER";
            }
        }
        return 1;
    },
};
