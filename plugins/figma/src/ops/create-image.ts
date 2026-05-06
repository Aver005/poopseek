import type { OpHandler } from "./types";
import type { ColorInput } from "../types";
import { nodeMap } from "../cache";
import { resolveParent, applyLayoutSizing, applyCornerRadii, solidPaint } from "../helpers";

export const handler: OpHandler = {
    type: "create_image",
    async execute(op, _nodeMap): Promise<number> {
        const src = typeof op.src === "string" ? op.src.trim() : "";
        const w = Number(op.width ?? 160);
        const h = Number(op.height ?? 100);

        if (src.length > 0)
        {
            try
            {
                let node;

                if (src.endsWith('.svg'))
                {
                    const srcCode = await (await fetch(src)).text();
                    node = figma.createNodeFromSvg(srcCode);
                }
                else
                {
                    const image = await figma.createImageAsync(src);
                    node = figma.createRectangle();
                    node.fills = [{ type: "IMAGE", imageHash: image.hash, scaleMode: "FILL" }];
                }

                resolveParent(op.frameId).appendChild(node);
                node.resize(w, h);
                node.name = String(op.name ?? "Image");
                if (op.cornerRadius !== undefined) node.cornerRadius = Number(op.cornerRadius);
                applyCornerRadii(node, op);
                applyLayoutSizing(node, op);
                if (op.x !== undefined) node.x = Number(op.x);
                if (op.y !== undefined) node.y = Number(op.y);
                if (op.id) nodeMap.set(String(op.id), node.id);
                return 1;
            }
            catch (error)
            {
                console.error(`createImageAsync failed for ${src}:`, error);
            }
        }

        let rect: RectangleNode | null = null;
        if (op.id) {
            const existing = await figma.getNodeByIdAsync(nodeMap.get(String(op.id)) ?? "");
            if (existing && existing.type === "RECTANGLE") rect = existing as RectangleNode;
        }
        if (!rect) {
            rect = figma.createRectangle();
            resolveParent(op.frameId).appendChild(rect);
            if (op.id) nodeMap.set(String(op.id), rect.id);
        }
        rect.resize(w, h);
        rect.name = String(op.name ?? "Image");
        if (op.cornerRadius !== undefined) rect.cornerRadius = Number(op.cornerRadius);
        applyCornerRadii(rect, op);
        applyLayoutSizing(rect, op);
        if (op.x !== undefined) rect.x = Number(op.x);
        if (op.y !== undefined) rect.y = Number(op.y);
        if (op.fill !== undefined) {
            const paint = await solidPaint(op.fill as ColorInput);
            if (paint) rect.fills = [paint];
        }
        return 1;
    },
};
