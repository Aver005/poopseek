import type { OpHandler } from "./types";
import type { FigmaOp } from "../types";
import { resolveNode } from "../helpers";

export const handler: OpHandler = {
    type: "set_auto_layout",
    async execute(op, nodeMap): Promise<number> {
        const node = resolveNode(op.nodeId, nodeMap);
        if (node && node.type === "FRAME") {
            const frame = node as FrameNode;
            const direction = op.direction
                ? String(op.direction) as "HORIZONTAL" | "VERTICAL" | "NONE"
                : frame.layoutMode;
            if (op.direction) frame.layoutMode = direction;

            const isVertical = direction === "VERTICAL";
            type SizingMode = "FIXED" | "HUG" | "FILL";
            const f = frame as FrameNode & {
                layoutSizingHorizontal: SizingMode;
                layoutSizingVertical: SizingMode;
            };

            if (isVertical) {
                f.layoutSizingVertical = op.hugMain ? "HUG" : (op.fillParentHeight ? "FILL" : "FIXED");
                f.layoutSizingHorizontal = op.fillParent ? "FILL" : "FIXED";
            } else {
                f.layoutSizingHorizontal = op.fillParent ? "FILL" : (op.hugMain ? "HUG" : "FIXED");
                f.layoutSizingVertical = op.fillParentHeight ? "FILL" : (op.hugCross ? "HUG" : "FIXED");
            }

            if (op.gap !== undefined) frame.itemSpacing = Number(op.gap);
            if (op.paddingH !== undefined) {
                frame.paddingLeft = Number(op.paddingH);
                frame.paddingRight = Number(op.paddingH);
            }
            if (op.paddingV !== undefined) {
                frame.paddingTop = Number(op.paddingV);
                frame.paddingBottom = Number(op.paddingV);
            }
            if (op.paddingLeft !== undefined) frame.paddingLeft = Number(op.paddingLeft);
            if (op.paddingRight !== undefined) frame.paddingRight = Number(op.paddingRight);
            if (op.paddingTop !== undefined) frame.paddingTop = Number(op.paddingTop);
            if (op.paddingBottom !== undefined) frame.paddingBottom = Number(op.paddingBottom);
            if (op.align) frame.primaryAxisAlignItems = String(op.align) as "MIN" | "MAX" | "CENTER" | "SPACE_BETWEEN";
            if (op.counterAlign) frame.counterAxisAlignItems = String(op.counterAlign) as "MIN" | "MAX" | "CENTER" | "BASELINE";
        }
        return 1;
    },
};
