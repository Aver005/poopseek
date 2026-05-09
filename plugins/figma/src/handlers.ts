import type { FigmaOp } from "./types";
import { buildPluginSnapshot } from "./helpers";
import { executeOps } from "./ops/index";
import { nodeMap } from "./cache";
import { dlog, derr, drainLogBuffer } from "./debug";

// figma.ui.onmessage is async and figma does NOT serialize re-entrant
// calls. If two EXECUTE_OPS messages arrive while the first is awaiting
// (e.g. on a slow `figma.createImageAsync` / `fetch`), they run in
// parallel and trample each other through the shared nodeMap and
// currentOpTag — half the canvas ends up duplicated/orphaned. Chain
// every batch through this Promise so they run strictly sequentially.
let executeOpsChain: Promise<void> = Promise.resolve();

async function runBatch(ops: FigmaOp[]): Promise<void>
{
    const t0 = Date.now();
    const beforeMapSize = nodeMap.size;
    // Always start each batch with a clean cache. Stale entries from a
    // prior failed batch are the #1 source of REUSE-by-id picking the
    // wrong (orphan) node. clear_frame_children repopulates the root
    // entry by name; descendants are recreated fresh.
    nodeMap.clear();
    dlog("EXECUTE_OPS", `received ${ops.length} ops, page="${figma.currentPage.name}" (children=${figma.currentPage.children.length}), nodeMap cleared (was ${beforeMapSize})`);

    try
    {
        const countBefore = figma.currentPage.children.length;
        const count = await executeOps(ops, nodeMap);
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
    finally
    {
        // Drain the per-batch log buffer and ship it to the UI as a
        // single copyable card. Lets the user share full debug context
        // with one click instead of scrolling the figma console.
        const lines = drainLogBuffer();
        if (lines.length > 0)
            figma.ui.postMessage({ type: "DEBUG_LOG", lines });
    }
}

figma.ui.onmessage = (msg: { type: string; ops?: FigmaOp[] }) =>
{
    if (msg.type === "EXECUTE_OPS" && msg.ops)
    {
        const ops = msg.ops;
        // Append to the chain. We don't await — figma.ui.onmessage runs
        // every incoming message synchronously, and serialization is
        // handled entirely through the chained Promise.
        executeOpsChain = executeOpsChain
            .catch(() => undefined)
            .then(() => runBatch(ops));
        return;
    }

    if (msg.type === "CLOSE")
    {
        dlog("CLOSE", "closing plugin");
        figma.closePlugin();
        return;
    }

    if (msg.type === "REQUEST_SNAPSHOT")
    {
        const snap = buildPluginSnapshot();
        dlog("REQUEST_SNAPSHOT", `roots=${snap.tree.length}, selected=${snap.selectedNodeIds.length}`);
        figma.ui.postMessage({
            type: "SNAPSHOT",
            snapshot: snap,
        });
        return;
    }

    if (msg.type === "REQUEST_SCREENSHOT")
    {
        const selected = figma.currentPage.selection;
        const targets: SceneNode[] = selected.length > 0
            ? [...selected]
            : [...figma.currentPage.children];

        if (targets.length === 0)
        {
            figma.ui.postMessage({ type: "SCREENSHOT_ERROR", error: "Нет нод для снимка" });
            return;
        }

        Promise.all(
            targets.slice(0, 4).map((node) =>
                node.exportAsync({ format: "PNG", constraint: { type: "SCALE", value: 0.5 } })
                    .then((bytes) => figma.base64Encode(bytes)),
            ),
        ).then((images) =>
        {
            const totalBytes = images.reduce((s, i) => s + i.length, 0);
            dlog("REQUEST_SCREENSHOT", `exported ${images.length} image(s), ~${Math.round(totalBytes * 0.75 / 1024)} KB`);
            figma.ui.postMessage({ type: "SCREENSHOT_READY", images });
        }).catch((err) =>
        {
            derr("REQUEST_SCREENSHOT", `export failed: ${err instanceof Error ? `${err.message}\n${err.stack}` : String(err)}`);
            figma.ui.postMessage({ type: "SCREENSHOT_ERROR", error: String(err) });
        });
        return;
    }
};
