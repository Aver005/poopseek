import type { OpHandler } from "./types";
import type { FigmaOp, ColorInput } from "../types";
import { nodeMap } from "../cache";
import { resolveParent, solidPaint } from "../helpers";

export const handler: OpHandler = {
    type: "create_line",
    async execute(op, _nodeMap): Promise<number> {
        let line: LineNode | null = null;
        if (op.id) {
            const existing = figma.getNodeById(nodeMap.get(String(op.id)) ?? "");
            if (existing && existing.type === "LINE") line = existing as LineNode;
        }
        if (!line) {
            line = figma.createLine();
            resolveParent(op.frameId).appendChild(line);
            if (op.id) nodeMap.set(op.id, line.id);
        }
        line.resize(Number(op.length ?? 100), 0);
        if (op.rotation !== undefined) line.rotation = Number(op.rotation);
        const linePaint = await solidPaint((op.color as ColorInput | undefined) ?? "#E5E5E5");
        if (linePaint) line.strokes = [linePaint];
        line.strokeWeight = op.weight !== undefined ? Number(op.weight) : 1;
        if (op.name) line.name = String(op.name);
        if (op.x !== undefined) line.x = Number(op.x);
        if (op.y !== undefined) line.y = Number(op.y);
        return 1;
    },
};
