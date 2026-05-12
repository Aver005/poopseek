import type { OpHandler } from "./types";
import { resolveNode } from "../helpers";
import { dlog, derr, describeNode } from "../debug";

// Re-orders an existing node inside its current parent. Used by the
// surgical edit path on the server to place a newly-created subtree at
// its intended sibling position — without it, create_frame would
// `appendChild` and the new section always lands at the end of the
// parent's children list, even when the diff put it earlier.
export const handler: OpHandler = {
    type: "set_child_index",
    async execute(op, nodeMap): Promise<number>
    {
        const node = resolveNode(op.nodeId, nodeMap);
        if (!node)
        {
            derr("set_child_index", `nodeId="${String(op.nodeId)}" did not resolve — skipping`);
            return 0;
        }
        const parent = (node as SceneNode & { parent: BaseNode | null }).parent;
        if (!parent || !("children" in parent))
        {
            derr("set_child_index", `${describeNode(node)} has no children-bearing parent — skipping`);
            return 0;
        }
        const kids = (parent as BaseNode & { children: ReadonlyArray<SceneNode> }).children;
        const requested = Number(op.index ?? 0);
        const clamped = Math.max(0, Math.min(requested, kids.length - 1));
        try
        {
            (parent as unknown as { insertChild: (idx: number, n: SceneNode) => void })
                .insertChild(clamped, node as SceneNode);
            dlog("set_child_index", `placed ${describeNode(node)} at index ${clamped} of parent (was ${kids.length} children)`);
        }
        catch (err)
        {
            derr("set_child_index", `insertChild(${clamped}) on ${describeNode(node)} failed: ${err instanceof Error ? err.message : String(err)}`);
        }
        return 1;
    },
};
