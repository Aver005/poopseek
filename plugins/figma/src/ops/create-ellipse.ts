import type { OpHandler } from "./types";
import type { ColorInput } from "../types";
import { nodeMap } from "../cache";
import { resolveParent, applyLayoutSizing, solidPaint } from "../helpers";

export const handler: OpHandler = {
    type: "create_ellipse",
    async execute(op, _nodeMap): Promise<number> {
        let ellipse: EllipseNode | null = null;
        if (op.id) {
            const existing = await figma.getNodeByIdAsync(nodeMap.get(String(op.id)) ?? "");
            if (existing && existing.type === "ELLIPSE") ellipse = existing as EllipseNode;
        }
        if (!ellipse) {
            const parent = resolveParent(op.frameId);
            const searchName = String(op.name ?? op.id ?? "");
            if ("children" in parent && searchName) {
                const found = parent.children.find(
                    n => n.name === searchName && n.type === "ELLIPSE",
                ) as EllipseNode | undefined;
                if (found) { ellipse = found; if (op.id) nodeMap.set(String(op.id), ellipse.id); }
            }
            if (!ellipse) {
                ellipse = figma.createEllipse();
                parent.appendChild(ellipse);
                if (op.id) nodeMap.set(String(op.id), ellipse.id);
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
