import type { OpHandler } from "./types";
import { nodeMap } from "../cache";
import { assignLogicalId, LOGICAL_ID_KEY } from "../helpers";
import { dlog, derr } from "../debug";

// Server-side surgical edit path emits this before any `create_*` op that
// targets an EXISTING figma node. Without it, `create_*` handlers skip
// find-by-name when `op.id` is provided (to prevent sibling aliasing on a
// generic name like "Frame" or "Text") and end up creating a fresh node —
// duplicating the existing one.
//
// Lookup order matters when several siblings share a `name`. Two cards
// each with a child named "Pricing" used to all alias onto whichever
// "Pricing" appeared first in DFS — `create_frame` then ran
// `ensureCorrectParent`, which physically re-parented that node into the
// caller's intended parent. Result: the user sees "Pricing 1" leap into
// card 2, "Pricing 2" into card 3, etc. We avoid that by preferring a
// persistent `pluginData(logicalId)` written at create_*-time. Name
// lookup remains as a fallback for designs that pre-date that tag.
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

        // Primary: persistent pluginData id (set by every create_* on
        // first touch). Uniquely identifies the node even when siblings
        // share `name`.
        let found: BaseNode | null = figma.currentPage.findOne(
            (n) => "getPluginData" in n
                && (n as SceneNode & { getPluginData: (k: string) => string }).getPluginData(LOGICAL_ID_KEY) === logicalId,
        );

        if (found)
        {
            nodeMap.set(logicalId, found.id);
            dlog("ensure_existing", `"${logicalId}" → bound by pluginData to ${found.type}#${found.id} name="${found.name}"`);
            return 0;
        }

        // Fallback: find-by-name. Designs that haven't been touched by
        // an LLM edit yet have no pluginData on their nodes. First match
        // wins; not perfect when names duplicate, but the moment we
        // touch a node it gets tagged via assignLogicalId below and
        // subsequent edits use the pluginData branch above.
        found = figma.currentPage.findOne((n) => n.name === targetName);
        if (!found)
        {
            derr("ensure_existing", `no node named "${targetName}" (or pluginData="${logicalId}") found on page — subsequent create_${logicalId} will fall back to creating a new node`);
            return 0;
        }
        nodeMap.set(logicalId, found.id);
        // Tag for next time. Cheap; preserves the user's name verbatim.
        assignLogicalId(found as SceneNode, logicalId);
        dlog("ensure_existing", `"${logicalId}" → bound by NAME to ${found.type}#${found.id} (tagged pluginData for next time)`);
        return 0;
    },
};
