import type { OpHandler } from "./types";
import type { FigmaOp } from "../types";
import { resolveNode } from "../helpers";

export const handler: OpHandler = {
    type: "set_clip_content",
    async execute(op, nodeMap): Promise<number> {
        const node = resolveNode(op.nodeId, nodeMap);
        if (node && node.type === "FRAME")
            (node as FrameNode).clipsContent = Boolean(op.clipContent);
        return 1;
    },
};
