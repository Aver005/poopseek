import type { OpHandler } from "./types";
import type { ColorInput } from "../types";
import { nodeMap } from "../cache";
import { resolveParent, applyLayoutSizing, solidPaint } from "../helpers";

export const handler: OpHandler = {
    type: "create_text",
    async execute(op, _nodeMap): Promise<number> {
        const weightMap: Record<string, string> = {
            Bold: "Bold", SemiBold: "Semi Bold", Medium: "Medium",
            Regular: "Regular", Light: "Light",
            "700": "Bold", "600": "Semi Bold", "500": "Medium",
            "400": "Regular", "300": "Light",
        };
        const style = weightMap[String(op.fontWeight ?? "Regular")] ?? "Regular";
        await figma.loadFontAsync({ family: "Inter", style });

        let text: TextNode | null = null;
        if (op.id) {
            const existing = await figma.getNodeByIdAsync(nodeMap.get(String(op.id)) ?? "");
            if (existing && existing.type === "TEXT") text = existing as TextNode;
        }
        if (!text) {
            const parent = resolveParent(op.frameId);
            const searchName = String(op.name ?? op.id ?? "");
            if ("children" in parent && searchName) {
                const found = parent.children.find(
                    n => n.name === searchName && n.type === "TEXT",
                ) as TextNode | undefined;
                if (found) { text = found; if (op.id) nodeMap.set(String(op.id), text.id); }
            }
            if (!text) {
                text = figma.createText();
                parent.appendChild(text);
                if (op.id) nodeMap.set(String(op.id), text.id);
            }
        }
        text.characters = String(op.content ?? "");
        text.fontName = { family: "Inter", style };
        if (op.fontSize !== undefined) text.fontSize = Number(op.fontSize);
        if (op.width !== undefined) {
            text.textAutoResize = "HEIGHT";
            text.resize(Number(op.width), text.height || 24);
        }
        if (op.color !== undefined) {
            const paint = await solidPaint(op.color as ColorInput);
            if (paint) text.fills = [paint];
        }
        if (op.name) text.name = String(op.name);
        applyLayoutSizing(text, op);
        if (op.x !== undefined) text.x = Number(op.x);
        if (op.y !== undefined) text.y = Number(op.y);
        if (op.fillParent) text.textAutoResize = "HEIGHT";
        return 1;
    },
};
