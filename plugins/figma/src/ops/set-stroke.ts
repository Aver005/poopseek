import type { OpHandler } from "./types";
import { resolveNode, solidPaintWithBinding } from "../helpers";

export const handler: OpHandler = {
    type: "set_stroke",
    async execute(op, nodeMap): Promise<number> {
        const node = resolveNode(op.nodeId, nodeMap);
        if (node && "strokes" in node && typeof op.color === "string") {
            const varName = typeof op.colorVariableName === "string" ? op.colorVariableName : undefined;
            const paint = await solidPaintWithBinding(op.color, varName);
            if (paint) {
                (node as GeometryMixin).strokes = [paint];
                if (op.weight !== undefined) (node as GeometryMixin).strokeWeight = Number(op.weight);
                if (op.align) (node as GeometryMixin).strokeAlign = String(op.align) as "INSIDE" | "OUTSIDE" | "CENTER";
            }
        }
        return 1;
    },
};
