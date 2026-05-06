import type { OpHandler } from "./types";
import type { ColorInput } from "../types";
import { nodeMap } from "../cache";
import { resolveParent, solidPaint, applyLayoutSizing } from "../helpers";

export const handler: OpHandler = {
    type: "create_line",
    async execute(op, _nodeMap): Promise<number> {
        let line: LineNode | null = null;
        if (op.id) {
            const existing = await figma.getNodeByIdAsync(nodeMap.get(String(op.id)) ?? "");
            if (existing && existing.type === "LINE") line = existing as LineNode;
        }
        if (!line) {
            const parent = resolveParent(op.frameId);
            const searchName = String(op.name ?? op.id ?? "");
            if ("children" in parent && searchName) {
                const found = parent.children.find(
                    n => n.name === searchName && n.type === "LINE",
                ) as LineNode | undefined;
                if (found) { line = found; if (op.id) nodeMap.set(String(op.id), line.id); }
            }
            if (!line) {
                line = figma.createLine();
                parent.appendChild(line);
                if (op.id) nodeMap.set(String(op.id), line.id);
            }
        }
        line.resize(Number(op.length ?? 100), 0);
        if (op.rotation !== undefined) line.rotation = Number(op.rotation);
        const linePaint = await solidPaint((op.color as ColorInput | undefined) ?? "#E5E5E5");
        if (linePaint) line.strokes = [linePaint];
        line.strokeWeight = op.weight !== undefined ? Number(op.weight) : 1;
        if (op.name) line.name = String(op.name);
        applyLayoutSizing(line, op);
        if (op.x !== undefined) line.x = Number(op.x);
        if (op.y !== undefined) line.y = Number(op.y);
        return 1;
    },
};
