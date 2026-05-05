import type { OpHandler } from "./types";
import type { FigmaOp, ColorInput } from "../types";
import { nodeMap } from "../cache";
import { resolveParent, applyLayoutSizing, applyCornerRadii, solidPaint } from "../helpers";

export const handler: OpHandler = {
    type: "create_rect",
    async execute(op, _nodeMap): Promise<number> {
        let rect: RectangleNode | null = null;
        if (op.id) {
            const existing = figma.getNodeById(nodeMap.get(String(op.id)) ?? "");
            if (existing && existing.type === "RECTANGLE") rect = existing as RectangleNode;
        }
        if (!rect) {
            rect = figma.createRectangle();
            resolveParent(op.frameId).appendChild(rect);
            if (op.id) nodeMap.set(op.id, rect.id);
        }
        rect.resize(Number(op.width ?? 100), Number(op.height ?? 100));
        if (op.fill !== undefined) {
            const paint = await solidPaint(op.fill as ColorInput);
            if (paint) rect.fills = [paint];
        }
        if (op.cornerRadius !== undefined) rect.cornerRadius = Number(op.cornerRadius);
        applyCornerRadii(rect, op);
        if (op.name) rect.name = String(op.name);
        if (op.x !== undefined) rect.x = Number(op.x);
        if (op.y !== undefined) rect.y = Number(op.y);
        applyLayoutSizing(rect, op);
        return 1;
    },
};
