import type { OpHandler } from "./types";
import { nodeMap } from "../cache";
import { resolveParent, solidPaintWithBinding, applyLayoutSizing, ensureCorrectParent } from "../helpers";
import { dlog, derr, describeNode } from "../debug";

export const handler: OpHandler = {
    type: "create_line",
    async execute(op, _nodeMap): Promise<number> {
        const opId = op.id ? String(op.id) : "(no-id)";
        let line: LineNode | null = null;

        if (op.id) {
            const cached = nodeMap.get(opId);
            if (cached) {
                const existing = await figma.getNodeByIdAsync(cached);
                if (existing && existing.type === "LINE")
                {
                    line = existing as LineNode;
                    dlog("create_line", `"${opId}" → REUSE by id → ${describeNode(line)}`);
                    ensureCorrectParent(line, op.frameId, "create_line");
                }
                else
                {
                    dlog("create_line", `"${opId}" → nodeMap had id="${cached}" but getNodeByIdAsync=${existing ? `type=${existing.type}` : "null"} (stale)`);
                }
            }
        }
        if (!line) {
            const parent = resolveParent(op.frameId);
            if (!op.id) {
                const searchName = String(op.name ?? "");
                if ("children" in parent && searchName) {
                    const found = parent.children.find(
                        n => n.name === searchName && n.type === "LINE",
                    ) as LineNode | undefined;
                    if (found) {
                        line = found;
                        dlog("create_line", `(no-id) → REUSE by name "${searchName}" under ${describeNode(parent)} → ${describeNode(line)}`);
                    }
                }
            }
            if (!line) {
                line = figma.createLine();
                parent.appendChild(line);
                if (op.id) nodeMap.set(opId, line.id);
                dlog("create_line", `"${opId}" → NEW under ${describeNode(parent)} → ${describeNode(line)}`);
                if (parent.type === "PAGE")
                    derr("create_line", `⚠ "${opId}" attached to PAGE. frameId="${op.frameId}" did not resolve.`);
            }
        }

        line.resize(Number(op.length ?? 100), 0);
        if (op.rotation !== undefined) line.rotation = Number(op.rotation);
        const colorHex = typeof op.color === "string" ? op.color : "#E5E5E5";
        const colorVar = typeof op.colorVariableName === "string" ? op.colorVariableName : undefined;
        const linePaint = await solidPaintWithBinding(colorHex, colorVar);
        if (linePaint) line.strokes = [linePaint];
        line.strokeWeight = op.weight !== undefined ? Number(op.weight) : 1;
        if (op.name) line.name = String(op.name);
        applyLayoutSizing(line, op);
        if (op.x !== undefined) line.x = Number(op.x);
        if (op.y !== undefined) line.y = Number(op.y);
        return 1;
    },
};
