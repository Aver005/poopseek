import type { OpHandler } from "./types";
import type { ColorInput } from "../types";
import { nodeMap } from "../cache";
import { resolveParent, applyLayoutSizing, solidPaint, ensureCorrectParent } from "../helpers";
import { dlog, derr, describeNode } from "../debug";

export const handler: OpHandler = {
    type: "create_text",
    async execute(op, _nodeMap): Promise<number> {
        const opId = op.id ? String(op.id) : "(no-id)";
        // Case-insensitive weight lookup. The compiler emits whatever the
        // model wrote ("bold", "semibold", "Bold", "Semi Bold", numeric…) and
        // a previous PascalCase-only map silently fell back to Regular.
        const weightMap: Record<string, string> = {
            bold: "Bold", semibold: "Semi Bold", "semi bold": "Semi Bold", "semi-bold": "Semi Bold",
            medium: "Medium", regular: "Regular", normal: "Regular", light: "Light",
            "700": "Bold", "600": "Semi Bold", "500": "Medium", "400": "Regular", "300": "Light",
        };
        const weightKey = String(op.fontWeight ?? "Regular").toLowerCase().trim();
        const style = weightMap[weightKey] ?? "Regular";
        try {
            await figma.loadFontAsync({ family: "Inter", style });
        }
        catch (err) {
            derr("create_text", `❌ "${opId}" loadFontAsync({Inter, ${style}}) failed: ${err instanceof Error ? err.message : String(err)}`);
            throw err;
        }

        let text: TextNode | null = null;
        if (op.id) {
            const cached = nodeMap.get(opId);
            if (cached) {
                const existing = await figma.getNodeByIdAsync(cached);
                if (existing && existing.type === "TEXT")
                {
                    text = existing as TextNode;
                    dlog("create_text", `"${opId}" → REUSE by id → ${describeNode(text)}`);
                    ensureCorrectParent(text, op.frameId, "create_text");
                }
                else
                {
                    dlog("create_text", `"${opId}" → nodeMap had id="${cached}" but getNodeByIdAsync=${existing ? `type=${existing.type}` : "null"} (stale)`);
                }
            }
        }
        if (!text) {
            const parent = resolveParent(op.frameId);
            // Skip find-by-name when op.id provided. The default text name is
            // literally "Text"; matching by it would alias every PriceText etc.
            // onto the first existing Text node in the parent.
            if (!op.id) {
                const searchName = String(op.name ?? "");
                if ("children" in parent && searchName) {
                    const found = parent.children.find(
                        n => n.name === searchName && n.type === "TEXT",
                    ) as TextNode | undefined;
                    if (found) {
                        text = found;
                        dlog("create_text", `(no-id) → REUSE by name "${searchName}" under ${describeNode(parent)} → ${describeNode(text)}`);
                    }
                }
            }
            if (!text) {
                text = figma.createText();
                parent.appendChild(text);
                if (op.id) nodeMap.set(opId, text.id);
                dlog("create_text", `"${opId}" → NEW under ${describeNode(parent)} → ${describeNode(text)}`);
                if (parent.type === "PAGE")
                {
                    derr("create_text", `⚠ "${opId}" was just attached to PAGE. If op.frameId="${op.frameId}" was supposed to point at an auto-layout frame, layoutSizing ops will fail.`);
                }
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
