import type { OpHandler } from "./types";
import { resolveNode } from "../helpers";

export const handler: OpHandler = {
    type: "clone_node",
    async execute(op, nodeMap): Promise<number>
    {
        const node = resolveNode(op.nodeId, nodeMap);
        if (node && "clone" in node)
        {
            const clone = (node as SceneNode).clone();
            if (op.offsetX !== undefined && "x" in clone) (clone as { x: number }).x += Number(op.offsetX);
            if (op.offsetY !== undefined && "y" in clone) (clone as { y: number }).y += Number(op.offsetY);
            (node as SceneNode).parent?.appendChild(clone);
            if (typeof op.newId === "string") nodeMap.set(op.newId, clone.id);
        }
        return 1;
    },
};
