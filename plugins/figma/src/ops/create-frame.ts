import type { OpHandler } from "./types";
import type { ColorInput } from "../types";
import { nodeMap } from "../cache";
import { resolveParent, applyLayoutSizing, applyCornerRadii, solidPaint } from "../helpers";

export const handler: OpHandler = {
    type: "create_frame",
    async execute(op, _nodeMap): Promise<number> {
        let frame: FrameNode | null = null;
        if (op.id) {
            const existing = await figma.getNodeByIdAsync(nodeMap.get(String(op.id)) ?? "");
            if (existing && existing.type === "FRAME") frame = existing as FrameNode;
        }
        const isNewFrame = !frame;
        if (!frame) {
            frame = figma.createFrame();
            resolveParent(op.frameId).appendChild(frame);
            if (op.id) nodeMap.set(op.id, frame.id);
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
