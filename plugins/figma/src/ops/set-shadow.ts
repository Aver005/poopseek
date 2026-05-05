import type { OpHandler } from "./types";
import type { FigmaOp } from "../types";
import { resolveNode, parseColor } from "../helpers";

export const handler: OpHandler = {
    type: "set_shadow",
    async execute(op, nodeMap): Promise<number> {
        const node = resolveNode(op.nodeId, nodeMap);
        if (node && "effects" in node) {
            const rgb = typeof op.color === "string" ? (parseColor(op.color) ?? { r: 0, g: 0, b: 0, a: 1 }) : { r: 0, g: 0, b: 0, a: 1 };
            const shadow: DropShadowEffect = {
                type: "DROP_SHADOW",
                color: { r: rgb.r, g: rgb.g, b: rgb.b, a: Number(op.opacity ?? 0.12) },
                offset: { x: Number(op.x ?? 0), y: Number(op.y ?? 4) },
                radius: Number(op.blur ?? 12),
                spread: Number(op.spread ?? 0),
                visible: true,
                blendMode: "NORMAL",
            };
            const existing = (node as BlendMixin).effects.filter((e) => e.type !== "DROP_SHADOW");
            (node as BlendMixin).effects = [...existing, shadow];
        }
        return 1;
    },
};
