import type { OpHandler } from "./types";
import { dlog, derr } from "../debug";

// Headless screenshot op — used by scripts/bench.ts.
//
// Exports the current page (or selection) to PNG, base64-encodes the
// bytes, POSTs them back to the server via /v1/screenshot-result. The
// server has a Promise parked under `screenshotId` and resolves it on
// receipt — that's what unblocks the calling script's HTTP request.
//
// We render at scale=1 by default; the script can request a different
// scale. For full-page captures we export every top-level node so the
// caller gets one PNG per root frame (most designs are a single root,
// but the bench supports multi-root pages anyway).

const SERVER_URL = "http://localhost:7331";

interface RequestScreenshotOp
{
    type: "request_screenshot";
    screenshotId: string;
    target?: "page" | "selection";
    scale?: number;
}

async function postResult(screenshotId: string, payload: { images?: string[]; error?: string }): Promise<void>
{
    try
    {
        await fetch(`${SERVER_URL}/v1/screenshot-result`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ screenshotId, ...payload }),
        });
    }
    catch (err)
    {
        derr("request_screenshot", `failed to POST result: ${String(err)}`);
    }
}

export const handler: OpHandler = {
    type: "request_screenshot",
    async execute(op): Promise<number>
    {
        const req = op as unknown as RequestScreenshotOp;
        const screenshotId = req.screenshotId;
        if (!screenshotId)
        {
            derr("request_screenshot", "missing screenshotId");
            return 0;
        }

        const scale = typeof req.scale === "number" && req.scale > 0 ? req.scale : 1;
        const useSelection = req.target === "selection" && figma.currentPage.selection.length > 0;
        const targets: ReadonlyArray<SceneNode> = useSelection
            ? figma.currentPage.selection
            : figma.currentPage.children;

        if (targets.length === 0)
        {
            await postResult(screenshotId, { error: "no nodes to screenshot" });
            return 0;
        }

        try
        {
            // Sequential, not Promise.all — parallel exports of multiple
            // large frames (e.g. 5-screen mobile flow) caused memory
            // spikes and stalls. One at a time stays predictable; we
            // also get a per-frame log so a single frozen export is
            // obvious in the debug log.
            const images: string[] = [];
            for (let k = 0; k < targets.length; k++)
            {
                const node = targets[k]!;
                const t0 = Date.now();
                const bytes = await node.exportAsync({
                    format: "PNG",
                    constraint: { type: "SCALE", value: scale },
                });
                const b64 = figma.base64Encode(bytes);
                images.push(b64);
                dlog(
                    "request_screenshot",
                    `  frame ${k + 1}/${targets.length} "${node.name}" ${node.type} ` +
                    `→ ${Math.round(b64.length * 0.75 / 1024)} KB in ${Date.now() - t0}ms`,
                );
            }
            const totalBytes = images.reduce((s, i) => s + i.length, 0);
            dlog(
                "request_screenshot",
                `id=${screenshotId} target=${useSelection ? "selection" : "page"} scale=${scale} ` +
                `→ ${images.length} image(s), ~${Math.round(totalBytes * 0.75 / 1024)} KB total`,
            );
            await postResult(screenshotId, { images });
            return 1;
        }
        catch (err)
        {
            const msg = err instanceof Error ? err.message : String(err);
            derr("request_screenshot", `export failed: ${msg}`);
            await postResult(screenshotId, { error: msg });
            return 0;
        }
    },
};
