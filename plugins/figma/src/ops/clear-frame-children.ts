import type { OpHandler } from "./types";
import { nodeMap } from "../cache";
import { dlog, derr, describeNode } from "../debug";

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
            if (node && node.type === "FRAME")
            {
                frame = node as FrameNode;
                dlog("clear_frame_children", `"${frameName}" → nodeMap hit → ${describeNode(frame)}`);
            }
            else
            {
                dlog("clear_frame_children", `"${frameName}" → nodeMap had id="${figmaId}" but getNodeById=${node ? `type=${node.type}` : "null"} (stale)`);
            }
        }
        else
        {
            dlog("clear_frame_children", `"${frameName}" → no nodeMap entry`);
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
                dlog("clear_frame_children", `"${frameName}" → page-child name match → ${describeNode(frame)}`);
            }
        }

        if (!frame)
        {
            derr("clear_frame_children", `❌ "${frameName}" not found anywhere — nothing cleared. Subsequent create_* ops with frameId="${frameName}" will fall back to currentPage.`);
            return 0;
        }

        const childCount = frame.children.length;
        let count = 0;
        for (const child of [...frame.children])
        {
            child.remove();
            count++;
        }
        dlog("clear_frame_children", `removed ${count}/${childCount} immediate children of "${frameName}"`);

        // Orphan top-level cleanup. Failed batches in the past leave stranded
        // frames at currentPage level (because resolveParent fell through to
        // page when nodeMap had stale entries). Anything at page level that
        // isn't this root is orphan garbage from prior failures — kill it.
        const pageChildren = [...figma.currentPage.children];
        let orphans = 0;
        const orphanNames: string[] = [];
        for (const node of pageChildren)
        {
            // Only kill stranded FRAMES that aren't the target. Leave loose
            // text/rect/etc. at page level alone — those are likely user
            // content, not our debris.
            if (node.id !== frame.id && node.type === "FRAME")
            {
                orphanNames.push(`${node.type}#${node.id}/"${node.name}"`);
                node.remove();
                orphans++;
            }
        }
        if (orphans > 0)
        {
            dlog("clear_frame_children", `removed ${orphans} orphan top-level FRAMES (debris from prior failed batches): ${orphanNames.slice(0, 10).join(", ")}${orphanNames.length > 10 ? `, +${orphanNames.length - 10} more` : ""}`);
        }

        // Deep sweep — some orphans hide nested inside surviving page-level
        // siblings or as detached subtrees still attached somewhere on the
        // page. Anything that isn't the target frame and isn't a descendant
        // of the target is debris. Restrict to our 5 primitive types so we
        // don't trash unrelated user content (sections, components, etc.).
        const targetSubtree = new Set<string>();
        const collectIds = (n: SceneNode): void =>
        {
            targetSubtree.add(n.id);
            if ("children" in n)
                for (const c of (n as SceneNode & { children: ReadonlyArray<SceneNode> }).children) collectIds(c);
        };
        collectIds(frame);

        let deepOrphans = 0;
        const deepOrphanNames: string[] = [];
        const ourTypes = new Set(["FRAME", "TEXT", "RECTANGLE", "ELLIPSE", "LINE"]);
        const allOnPage = figma.currentPage.findAll(() => true);
        for (const n of allOnPage)
        {
            if (targetSubtree.has(n.id)) continue;
            if (!ourTypes.has(n.type)) continue;
            try
            {
                deepOrphanNames.push(`${n.type}#${n.id}/"${n.name}"`);
                n.remove();
                deepOrphans++;
            }
            catch { /* already removed via cascade from an ancestor we hit earlier */ }
        }
        if (deepOrphans > 0)
        {
            dlog("clear_frame_children", `deep-cleaned ${deepOrphans} stranded primitives outside the target subtree: ${deepOrphanNames.slice(0, 10).join(", ")}${deepOrphanNames.length > 10 ? `, +${deepOrphanNames.length - 10} more` : ""}`);
        }

        // After removal, any nodeMap entry pointing to a now-detached figma id
        // would silently mis-resolve in subsequent ops (e.g. resolveParent
        // falls through to figma.currentPage, attaching new nodes to the page
        // root and breaking auto-layout). Prune stale entries.
        const before = nodeMap.size;
        const pruned: string[] = [];
        for (const [key, fid] of [...nodeMap.entries()])
        {
            const n = await figma.getNodeByIdAsync(fid);
            if (!n)
            {
                nodeMap.delete(key);
                pruned.push(key);
            }
        }
        if (pruned.length > 0)
        {
            dlog("clear_frame_children", `pruned ${pruned.length}/${before} stale nodeMap entries: [${pruned.slice(0, 20).join(", ")}${pruned.length > 20 ? `, +${pruned.length - 20} more` : ""}]`);
        }
        else
        {
            dlog("clear_frame_children", `no stale nodeMap entries to prune (size=${nodeMap.size})`);
        }

        return count;
    },
};
