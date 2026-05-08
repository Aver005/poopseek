import type { FigmaOp } from "./types";
import { buildPluginSnapshot } from "./helpers";
import { executeOps } from "./ops/index";
import { nodeMap } from "./cache";
import { dlog, derr } from "./debug";

figma.ui.onmessage = async (msg: { type: string; ops?: FigmaOp[] }) =>
{
    if (msg.type === "EXECUTE_OPS" && msg.ops)
    {
        const t0 = Date.now();
        const beforeMapSize = nodeMap.size;
        // Always start each batch with a clean cache. Stale entries from a
        // prior failed batch are the #1 source of REUSE-by-id picking the
        // wrong (orphan) node. clear_frame_children will repopulate the root
        // entry by name; descendants are recreated fresh.
        nodeMap.clear();
        dlog("EXECUTE_OPS", `received ${msg.ops.length} ops, page="${figma.currentPage.name}" (children=${figma.currentPage.children.length}), nodeMap cleared (was ${beforeMapSize})`);
        try
        {
            const countBefore = figma.currentPage.children.length;
            const count = await executeOps(msg.ops, nodeMap);
            if (count > 0)
            {
                const newTopLevel = figma.currentPage.children.slice(countBefore);
                const toView = newTopLevel.length > 0 ? newTopLevel : figma.currentPage.children.slice(-1);
                figma.viewport.scrollAndZoomIntoView(toView);
            }
            const dt = Date.now() - t0;
            dlog("EXECUTE_OPS", `done in ${dt}ms, ${count} ops produced output, page.children=${figma.currentPage.children.length}, nodeMap.size=${nodeMap.size}`);
            figma.ui.postMessage({ type: "OPS_DONE", count });
        }
        catch (err)
        {
            derr("EXECUTE_OPS", `❌ batch threw: ${err instanceof Error ? `${err.message}\n${err.stack}` : String(err)}`);
            figma.ui.postMessage({ type: "OPS_ERROR", error: String(err) });
        }
    }

    if (msg.type === "CLOSE")
    {
        dlog("CLOSE", "closing plugin");
        figma.closePlugin();
    }

    if (msg.type === "REQUEST_SNAPSHOT")
    {
        const snap = buildPluginSnapshot();
        dlog("REQUEST_SNAPSHOT", `roots=${snap.tree.length}, selected=${snap.selectedNodeIds.length}`);
        figma.ui.postMessage({
            type: "SNAPSHOT",
            snapshot: snap,
        });
    }
};
