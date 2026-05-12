import type { OpHandler } from "./types";
import { nodeMap } from "../cache";
import { resolveParent, applyLayoutSizing, applyCornerRadii, solidPaintWithBinding, bindNumberVariable, ensureCorrectParent, assignLogicalId } from "../helpers";
import { dlog, derr, describeNode } from "../debug";

function vstr(v: unknown): string | undefined { return typeof v === "string" ? v : undefined; }

export const handler: OpHandler = {
    type: "create_rect",
    async execute(op, _nodeMap): Promise<number> {
        const opId = op.id ? String(op.id) : "(no-id)";
        let rect: RectangleNode | null = null;

        if (op.id) {
            const cached = nodeMap.get(opId);
            if (cached) {
                const existing = await figma.getNodeByIdAsync(cached);
                if (existing && existing.type === "RECTANGLE")
                {
                    rect = existing as RectangleNode;
                    dlog("create_rect", `"${opId}" → REUSE by id → ${describeNode(rect)}`);
                    ensureCorrectParent(rect, op.frameId, "create_rect");
                }
                else
                {
                    dlog("create_rect", `"${opId}" → nodeMap had id="${cached}" but getNodeByIdAsync=${existing ? `type=${existing.type}` : "null"} (stale)`);
                }
            }
        }
        if (!rect) {
            const parent = resolveParent(op.frameId);
            if (!op.id) {
                const searchName = String(op.name ?? "");
                if ("children" in parent && searchName) {
                    const found = parent.children.find(
                        n => n.name === searchName && n.type === "RECTANGLE",
                    ) as RectangleNode | undefined;
                    if (found) {
                        rect = found;
                        dlog("create_rect", `(no-id) → REUSE by name "${searchName}" under ${describeNode(parent)} → ${describeNode(rect)}`);
                    }
                }
            }
            if (!rect) {
                rect = figma.createRectangle();
                parent.appendChild(rect);
                if (op.id) nodeMap.set(opId, rect.id);
                dlog("create_rect", `"${opId}" → NEW under ${describeNode(parent)} → ${describeNode(rect)}`);
                if (parent.type === "PAGE")
                    derr("create_rect", `⚠ "${opId}" attached to PAGE. frameId="${op.frameId}" did not resolve.`);
            }
        }

        rect.resize(Number(op.width ?? 100), Number(op.height ?? 100));
        if (typeof op.fill === "string") {
            const paint = await solidPaintWithBinding(op.fill, vstr(op.fillVariableName));
            if (paint) rect.fills = [paint];
        }
        if (op.cornerRadius !== undefined) rect.cornerRadius = Number(op.cornerRadius);
        await bindNumberVariable(rect, "topLeftRadius",     vstr(op.cornerRadiusVariableName), "create_rect");
        await bindNumberVariable(rect, "topRightRadius",    vstr(op.cornerRadiusVariableName), "create_rect");
        await bindNumberVariable(rect, "bottomLeftRadius",  vstr(op.cornerRadiusVariableName), "create_rect");
        await bindNumberVariable(rect, "bottomRightRadius", vstr(op.cornerRadiusVariableName), "create_rect");
        applyCornerRadii(rect, op);
        if (op.name) rect.name = String(op.name);
        assignLogicalId(rect, op.id);
        applyLayoutSizing(rect, op);
        if (op.x !== undefined) rect.x = Number(op.x);
        if (op.y !== undefined) rect.y = Number(op.y);
        return 1;
    },
};
