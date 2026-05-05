import type { OpHandler } from "./types";
import type { ColorInput } from "../types";
import { nodeMap } from "../cache";
import { resolveParent, applyLayoutSizing, applyCornerRadii, solidPaint } from "../helpers";

export const handler: OpHandler = {
    type: "create_image",
    async execute(op, _nodeMap): Promise<number> {
        let rect: RectangleNode | null = null;
        if (op.id) {
            const existing = await figma.getNodeByIdAsync(nodeMap.get(String(op.id)) ?? "");
            if (existing && existing.type === "RECTANGLE") rect = existing as RectangleNode;
        }
        if (!rect) {
            rect = figma.createRectangle();
            resolveParent(op.frameId).appendChild(rect);
            if (op.id) nodeMap.set(op.id, rect.id);
        }
        rect.resize(Number(op.width ?? 160), Number(op.height ?? 100));
        rect.name = String(op.name ?? "Image");
        if (op.cornerRadius !== undefined) rect.cornerRadius = Number(op.cornerRadius);
        applyCornerRadii(rect, op);
        applyLayoutSizing(rect, op);
        if (op.x !== undefined) rect.x = Number(op.x);
        if (op.y !== undefined) rect.y = Number(op.y);

        let imageApplied = false;
        if (typeof op.src === "string" && op.src.trim().length > 0) {
            try {
                const response = await fetch(op.src);
                if (response.ok) {
                    const bytes = new Uint8Array(await response.arrayBuffer());
                    const image = figma.createImage(bytes);
                    rect.fills = [{ type: "IMAGE", imageHash: image.hash, scaleMode: "FILL" }];
                    imageApplied = true;
                }
            } catch (error) {
                console.error(`Image fetch failed for ${String(op.src)}:`, error);
            }
        }

        if (!imageApplied && op.fill !== undefined) {
            const paint = await solidPaint(op.fill as ColorInput);
            if (paint) rect.fills = [paint];
        }
        return 1;
    },
};
