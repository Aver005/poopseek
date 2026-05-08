import type { OpHandler } from "./types";
import type { ColorInput } from "../types";
import { nodeMap } from "../cache";
import { resolveParent, applyLayoutSizing, solidPaint, ensureCorrectParent } from "../helpers";
import { dlog, derr, describeNode } from "../debug";

export const handler: OpHandler = {
    type: "create_ellipse",
    async execute(op, _nodeMap): Promise<number> {
        const opId = op.id ? String(op.id) : "(no-id)";
        let ellipse: EllipseNode | null = null;

        if (op.id) {
            const cached = nodeMap.get(opId);
            if (cached) {
                const existing = await figma.getNodeByIdAsync(cached);
                if (existing && existing.type === "ELLIPSE")
                {
                    ellipse = existing as EllipseNode;
                    dlog("create_ellipse", `"${opId}" → REUSE by id → ${describeNode(ellipse)}`);
                    ensureCorrectParent(ellipse, op.frameId, "create_ellipse");
                }
                else
                {
                    dlog("create_ellipse", `"${opId}" → nodeMap had id="${cached}" but getNodeByIdAsync=${existing ? `type=${existing.type}` : "null"} (stale)`);
                }
            }
        }
        if (!ellipse) {
            const parent = resolveParent(op.frameId);
            if (!op.id) {
                const searchName = String(op.name ?? "");
                if ("children" in parent && searchName) {
                    const found = parent.children.find(
                        n => n.name === searchName && n.type === "ELLIPSE",
                    ) as EllipseNode | undefined;
                    if (found) {
                        ellipse = found;
                        dlog("create_ellipse", `(no-id) → REUSE by name "${searchName}" under ${describeNode(parent)} → ${describeNode(ellipse)}`);
                    }
                }
            }
            if (!ellipse) {
                ellipse = figma.createEllipse();
                parent.appendChild(ellipse);
                if (op.id) nodeMap.set(opId, ellipse.id);
                dlog("create_ellipse", `"${opId}" → NEW under ${describeNode(parent)} → ${describeNode(ellipse)}`);
                if (parent.type === "PAGE")
                    derr("create_ellipse", `⚠ "${opId}" attached to PAGE. frameId="${op.frameId}" did not resolve.`);
            }
        }

        ellipse.resize(Number(op.width ?? 100), Number(op.height ?? 100));
        if (op.fill !== undefined) {
            const paint = await solidPaint(op.fill as ColorInput);
            if (paint) ellipse.fills = [paint];
        }
        if (op.name) ellipse.name = String(op.name);
        applyLayoutSizing(ellipse, op);
        if (op.x !== undefined) ellipse.x = Number(op.x);
        if (op.y !== undefined) ellipse.y = Number(op.y);
        return 1;
    },
};
