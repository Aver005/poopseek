import type { OpHandler } from "./types";
import type { FigmaOp } from "../types";
import { resolveNode } from "../helpers";

export const handler: OpHandler = {
    type: "set_text_style",
    async execute(op, nodeMap): Promise<number> {
        const node = resolveNode(op.nodeId, nodeMap);
        if (node && node.type === "TEXT") {
            const text = node as TextNode;
            if (op.align) text.textAlignHorizontal = String(op.align) as "LEFT" | "CENTER" | "RIGHT" | "JUSTIFIED";
            if (op.lineHeight !== undefined) text.lineHeight = { unit: "PIXELS", value: Number(op.lineHeight) };
            if (op.letterSpacing !== undefined) text.letterSpacing = { unit: "PERCENT", value: Number(op.letterSpacing) };
            if (op.decoration) text.textDecoration = String(op.decoration) as "NONE" | "UNDERLINE" | "STRIKETHROUGH";
        }
        return 1;
    },
};
