import type { OpHandler } from "./types";
import type { FigmaOp } from "../types";

export const handler: OpHandler = {
    type: "group_nodes",
    async execute(op, nodeMap): Promise<number> {
        if (Array.isArray(op.nodeIds) && op.nodeIds.length > 0) {
            const nodes = (op.nodeIds as string[])
                .map((id) => { const fid = nodeMap.get(id); return fid ? figma.getNodeById(fid) : null; })
                .filter((n): n is SceneNode => n !== null && "type" in n && n.type !== "PAGE" && n.type !== "DOCUMENT");

            if (nodes.length > 0) {
                const parent = (nodes[0]!.parent ?? figma.currentPage) as PageNode | FrameNode;
                const group = figma.group(nodes, parent);
                if (op.name) group.name = String(op.name);
                if (op.id) nodeMap.set(String(op.id), group.id);
            }
        }
        return 1;
    },
};
