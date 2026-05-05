import type { FigmaOp } from "./types";
import { buildPluginSnapshot } from "./helpers";
import { executeOps } from "./ops/index";
import { nodeMap } from "./cache";

figma.ui.onmessage = async (msg: { type: string; ops?: FigmaOp[] }) =>
{
    if (msg.type === "EXECUTE_OPS" && msg.ops)
    {
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
            figma.ui.postMessage({ type: "OPS_DONE", count });
        }
        catch (err)
        {
            figma.ui.postMessage({ type: "OPS_ERROR", error: String(err) });
        }
    }

    if (msg.type === "CLOSE")
    {
        figma.closePlugin();
    }

    if (msg.type === "REQUEST_SNAPSHOT")
    {
        figma.ui.postMessage({
            type: "SNAPSHOT",
            snapshot: buildPluginSnapshot(),
        });
    }
};
