import type { OpHandler } from "./types";
import { nodeMap } from "../cache";

export const handler: OpHandler = {
    type: "clear_frame_children",
    async execute(op): Promise<number>
    {
        const frameName = String(op.frameName ?? "");

        let frame: FrameNode | null = null;

        const figmaId = nodeMap.get(frameName);
        if (figmaId)
        {
            const node = figma.getNodeById(figmaId);
            if (node && node.type === "FRAME") frame = node as FrameNode;
        }

        if (!frame)
        {
            const found = figma.currentPage.children.find(
                n => n.name === frameName && n.type === "FRAME",
            ) as FrameNode | undefined;
            if (found)
            {
                frame = found;
                nodeMap.set(frameName, found.id);
            }
        }

        if (!frame) return 0;

        let count = 0;
        for (const child of [...frame.children])
        {
            child.remove();
            count++;
        }
        return count;
    },
};
