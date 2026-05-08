import type { OpHandler } from "./types";
import type { ColorInput } from "../types";
import { nodeMap } from "../cache";
import { resolveParent, applyLayoutSizing, applyCornerRadii, solidPaint, ensureCorrectParent } from "../helpers";
import { dlog, derr, describeNode } from "../debug";

export const handler: OpHandler = {
    type: "create_frame",
    async execute(op, _nodeMap): Promise<number> {
        const opId = op.id ? String(op.id) : "(no-id)";
        let frame: FrameNode | null = null;

        if (op.id) {
            const cached = nodeMap.get(opId);
            if (cached) {
                const existing = await figma.getNodeByIdAsync(cached);
                if (existing && existing.type === "FRAME")
                {
                    frame = existing as FrameNode;
                    dlog("create_frame", `"${opId}" → REUSE by id → ${describeNode(frame)}`);
                    ensureCorrectParent(frame, op.frameId, "create_frame");
                }
                else
                {
                    dlog("create_frame", `"${opId}" → nodeMap had id="${cached}" but getNodeByIdAsync=${existing ? `type=${existing.type}` : "null"} (stale)`);
                }
            }
        }

        const isNewFrame = !frame;
        if (!frame) {
            const parent = resolveParent(op.frameId);
            // Only fall back to find-by-name when op.id is NOT provided. With
            // op.id, find-by-name on a generic name like "Frame" or "Text"
            // can latch onto a sibling and alias two keys to one figma node.
            if (!op.id) {
                const searchName = String(op.name ?? "");
                if ("children" in parent && searchName) {
                    const found = parent.children.find(
                        n => n.name === searchName && n.type === "FRAME",
                    ) as FrameNode | undefined;
                    if (found) {
                        frame = found;
                        dlog("create_frame", `(no-id) → REUSE by name "${searchName}" under ${describeNode(parent)} → ${describeNode(frame)}`);
                    }
                }
            }
            if (!frame) {
                frame = figma.createFrame();
                parent.appendChild(frame);
                if (op.id) nodeMap.set(opId, frame.id);
                dlog("create_frame", `"${opId}" → NEW under ${describeNode(parent)} → ${describeNode(frame)}`);
                if (parent.type === "PAGE")
                {
                    derr("create_frame", `⚠ "${opId}" was just attached to PAGE (currentPage). If op.frameId="${op.frameId}" was supposed to point at an auto-layout frame, layoutSizing ops on this node will fail.`);
                }
            }
        }

        frame.name = String(op.name ?? "Frame");
        frame.resize(Number(op.width ?? 100), Number(op.height ?? 100));
        if (op.fill !== undefined) {
            const paint = await solidPaint(op.fill as ColorInput);
            frame.fills = paint ? [paint] : [];
        } else if (isNewFrame) {
            frame.fills = [];
        }
        if (op.cornerRadius !== undefined) frame.cornerRadius = Number(op.cornerRadius);
        applyCornerRadii(frame, op);
        if (op.clipContent !== undefined) frame.clipsContent = Boolean(op.clipContent);
        applyLayoutSizing(frame, op);
        if (op.x !== undefined) frame.x = Number(op.x);
        if (op.y !== undefined) frame.y = Number(op.y);
        return 1;
    },
};
