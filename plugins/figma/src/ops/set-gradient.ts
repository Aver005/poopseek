import type { OpHandler } from "./types";
import type { FigmaOp } from "../types";
import { resolveNode, parseColor, angleToGradientTransform } from "../helpers";

export const handler: OpHandler = {
    type: "set_gradient",
    async execute(op, nodeMap): Promise<number> {
        const node = resolveNode(op.nodeId, nodeMap);
        if (node && "fills" in node && typeof op.from === "string" && typeof op.to === "string") {
            const rgb1 = parseColor(op.from);
            const rgb2 = parseColor(op.to);
            if (rgb1 && rgb2) {
                const transform = angleToGradientTransform(Number(op.angle ?? 0));
                (node as GeometryMixin).fills = [{
                    type: "GRADIENT_LINEAR",
                    gradientTransform: transform,
                    gradientStops: [
                        { position: 0, color: { r: rgb1.r, g: rgb1.g, b: rgb1.b, a: 1 } },
                        { position: 1, color: { r: rgb2.r, g: rgb2.g, b: rgb2.b, a: 1 } },
                    ],
                }];
            }
        }
        return 1;
    },
};
