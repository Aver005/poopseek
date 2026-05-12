import type { OpHandler } from "./types";
import { nodeMap } from "../cache";
import { dlog, derr } from "../debug";

// Server-side surgical edit path emits this before any `create_*` op that
// targets an EXISTING figma node. Without it, `create_*` handlers skip
// find-by-name when `op.id` is provided (to prevent sibling aliasing on a
// generic name like "Frame" or "Text") and end up creating a fresh node —
// duplicating the existing one. This op does a deep `findOne` by name and
// populates `nodeMap[logicalId] = figmaId` so the subsequent `create_*`
// hits its REUSE-by-id branch and updates props in place.
export const handler: OpHandler = {
    type: "ensure_existing",
    async execute(op): Promise<number>
    {
        const logicalId = String(op.logicalId ?? "").trim();
        const targetName = String(op.name ?? logicalId).trim();
        if (!logicalId || !targetName)
        {
            derr("ensure_existing", `empty logicalId="${logicalId}" or name="${targetName}" — skipping`);
            return 0;
        }
        if (nodeMap.has(logicalId))
        {
            dlog("ensure_existing", `"${logicalId}" already in nodeMap — no-op`);
            return 0;
        }
        const found = figma.currentPage.findOne(n => n.name === targetName);
        if (!found)
        {
            derr("ensure_existing", `no node named "${targetName}" found on page — subsequent create_${logicalId} will fall back to creating a new node`);
            return 0;
        }
        nodeMap.set(logicalId, found.id);
        dlog("ensure_existing", `"${logicalId}" → bound to ${found.type}#${found.id} name="${found.name}"`);
        return 0;
    },
};
