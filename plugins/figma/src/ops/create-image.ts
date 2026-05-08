import type { OpHandler } from "./types";
import type { ColorInput } from "../types";
import { nodeMap } from "../cache";
import { resolveParent, applyLayoutSizing, applyCornerRadii, solidPaint, ensureCorrectParent } from "../helpers";
import { dlog, derr, describeNode } from "../debug";

export const handler: OpHandler = {
    type: "create_image",
    async execute(op, _nodeMap): Promise<number> {
        const opId = op.id ? String(op.id) : "(no-id)";
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

                const parent = resolveParent(op.frameId);
                parent.appendChild(node);
                node.resize(w, h);
                node.name = String(op.name ?? "Image");
                if (op.cornerRadius !== undefined) node.cornerRadius = Number(op.cornerRadius);
                applyCornerRadii(node, op);
                applyLayoutSizing(node, op);
                if (op.x !== undefined) node.x = Number(op.x);
                if (op.y !== undefined) node.y = Number(op.y);
                if (op.id) nodeMap.set(opId, node.id);
                dlog("create_image", `"${opId}" → NEW (src) under ${describeNode(parent)} → ${describeNode(node)}`);
                if (parent.type === "PAGE")
                    derr("create_image", `⚠ "${opId}" attached to PAGE. frameId="${op.frameId}" did not resolve.`);
                return 1;
            }
            catch (error)
            {
                derr("create_image", `❌ src="${src}" failed: ${error instanceof Error ? error.message : String(error)} — falling back to placeholder rect`);
            }
        }

        let rect: RectangleNode | null = null;
        if (op.id) {
            const cached = nodeMap.get(opId);
            if (cached) {
                const existing = await figma.getNodeByIdAsync(cached);
                if (existing && existing.type === "RECTANGLE")
                {
                    rect = existing as RectangleNode;
                    dlog("create_image", `"${opId}" → REUSE placeholder by id → ${describeNode(rect)}`);
                    ensureCorrectParent(rect, op.frameId, "create_image");
                }
            }
        }
        if (!rect) {
            const parent = resolveParent(op.frameId);
            rect = figma.createRectangle();
            parent.appendChild(rect);
            if (op.id) nodeMap.set(opId, rect.id);
            dlog("create_image", `"${opId}" → NEW placeholder under ${describeNode(parent)} → ${describeNode(rect)}`);
            if (parent.type === "PAGE")
                derr("create_image", `⚠ "${opId}" placeholder attached to PAGE. frameId="${op.frameId}" did not resolve.`);
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
