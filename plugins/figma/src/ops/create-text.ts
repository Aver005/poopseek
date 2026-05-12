import type { OpHandler } from "./types";
import { nodeMap } from "../cache";
import { resolveParent, applyLayoutSizing, solidPaintWithBinding, ensureCorrectParent, findTextStyleByName, assignLogicalId } from "../helpers";
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
        // Load both Inter Regular AND the target style. `figma.createText()`
        // produces a fresh node with default fontName=Inter Regular, and
        // `text.characters = …` requires the CURRENT font to be loaded —
        // so without Regular loaded, every text node with a non-Regular
        // target weight throws "Cannot write to node with unloaded font
        // 'Inter Regular'". Loading both is cheap (loadFontAsync is cached
        // by Figma).
        try {
            await figma.loadFontAsync({ family: "Inter", style: "Regular" });
            if (style !== "Regular")
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

        // Bind to a typography text-style if one was emitted by the compiler.
        // This OVERWRITES the per-prop fontSize/fontWeight/lineHeight set
        // above — we kept those as defense-in-depth in case the style
        // hasn't materialized yet.
        const textStyleName = typeof op.textStyleName === "string" ? op.textStyleName : undefined;
        if (textStyleName)
        {
            const ts = await findTextStyleByName(textStyleName);
            if (ts)
            {
                try
                {
                    await figma.loadFontAsync(ts.fontName);
                    await text.setTextStyleIdAsync(ts.id);
                    if (text.textStyleId === ts.id)
                        dlog("create_text", `bound textStyle="${textStyleName}" (id=${ts.id}) on TEXT#${text.id}`);
                    else
                        derr("create_text", `❌ setTextStyleIdAsync("${textStyleName}") did NOT take effect — textStyleId is "${String(text.textStyleId)}"`);
                }
                catch (err)
                {
                    derr("create_text", `setTextStyleIdAsync("${textStyleName}") failed: ${err instanceof Error ? err.message : String(err)} — falling back to inline props`);
                }
            }
            else
            {
                derr("create_text", `❌ textStyleName="${textStyleName}" not found in local text styles — using inline font props`);
            }
        }
        if (typeof op.color === "string") {
            const varName = typeof op.colorVariableName === "string" ? op.colorVariableName : undefined;
            const paint = await solidPaintWithBinding(op.color, varName);
            if (paint) text.fills = [paint];
        }
        if (op.name) text.name = String(op.name);
        assignLogicalId(text, op.id);
        applyLayoutSizing(text, op);
        if (op.x !== undefined) text.x = Number(op.x);
        if (op.y !== undefined) text.y = Number(op.y);
        if (op.fillParent) text.textAutoResize = "HEIGHT";
        return 1;
    },
};
