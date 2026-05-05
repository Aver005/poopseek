import type { OpHandler } from "./types";
import type { ColorInput } from "../types";
import { nodeMap } from "../cache";
import { resolveParent, applyLayoutSizing, applyCornerRadii, solidPaint } from "../helpers";

async function applySvgNode(op: Record<string, unknown>, svgText: string): Promise<boolean> {
    try {
        const svgNode = await figma.createNodeFromSvgAsync(svgText);
        const parent = resolveParent(op.frameId);
        parent.appendChild(svgNode);
        const w = Number(op.width ?? 24);
        const h = Number(op.height ?? 24);
        svgNode.resize(w, h);
        svgNode.name = String(op.name ?? "Image");
        if (op.x !== undefined) svgNode.x = Number(op.x);
        if (op.y !== undefined) svgNode.y = Number(op.y);
        applyLayoutSizing(svgNode as FrameNode, op);
        if (op.id) nodeMap.set(String(op.id), svgNode.id);
        return true;
    } catch {
        return false;
    }
}

export const handler: OpHandler = {
    type: "create_image",
    async execute(op, _nodeMap): Promise<number> {
        const src = typeof op.src === "string" ? op.src.trim() : "";
        const isSvg = src.toLowerCase().endsWith(".svg");

        if (isSvg && src.length > 0) {
            try {
                const response = await fetch(src);
                if (response.ok) {
                    const svgText = await response.text();
                    if (await applySvgNode(op, svgText)) return 1;
                }
            } catch {
                // fall through to rectangle fallback
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
        rect.resize(Number(op.width ?? 160), Number(op.height ?? 100));
        rect.name = String(op.name ?? "Image");
        if (op.cornerRadius !== undefined) rect.cornerRadius = Number(op.cornerRadius);
        applyCornerRadii(rect, op);
        applyLayoutSizing(rect, op);
        if (op.x !== undefined) rect.x = Number(op.x);
        if (op.y !== undefined) rect.y = Number(op.y);

        let imageApplied = false;
        if (!isSvg && src.length > 0) {
            try {
                const response = await fetch(src);
                if (response.ok) {
                    const bytes = new Uint8Array(await response.arrayBuffer());
                    const image = figma.createImage(bytes);
                    rect.fills = [{ type: "IMAGE", imageHash: image.hash, scaleMode: "FILL" }];
                    imageApplied = true;
                }
            } catch {
                console.error(`Image fetch failed for ${src}`);
            }
        }

        if (!imageApplied && op.fill !== undefined) {
            const paint = await solidPaint(op.fill as ColorInput);
            if (paint) rect.fills = [paint];
        }
        return 1;
    },
};
