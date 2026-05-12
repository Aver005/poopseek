import type { FigmaOp } from "@/figma/api/contracts";
import { invalidJson, jsonWithCors, type FigmaHttpContext } from "./common";

// Headless screenshot pipeline used by scripts (e.g. bench.ts).
//
// Flow:
//   1. Script POSTs /v1/screenshot — server generates a correlation id,
//      pushes a `request_screenshot` op to pendingOps, and parks the
//      response on a Promise stored under that id.
//   2. Plugin polls /v1/poll-ops, picks up the op, exports the current
//      page to PNG (base64), POSTs to /v1/screenshot-result.
//   3. Server resolves the Promise, /v1/screenshot returns the images.
//
// The op is regular — same shape as wipe_design. The plugin handler is
// the only piece that knows about screenshot export.

const DEFAULT_TIMEOUT_MS = 60_000;

interface ScreenshotRequestBody
{
    timeoutMs?: number;
    /** "page" exports all top-level children at scale=1 (full PNG).
     *  "selection" exports current selection — defaults to "page". */
    target?: "page" | "selection";
    scale?: number;
}

export async function handleRequestScreenshot(req: Request, context: FigmaHttpContext): Promise<Response>
{
    let body: ScreenshotRequestBody = {};
    if (req.headers.get("Content-Length") !== "0")
    {
        try { body = await req.json() as ScreenshotRequestBody; }
        catch { return invalidJson(context.getCorsHeaders); }
    }

    const id = crypto.randomUUID();
    const timeoutMs = body.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const target = body.target ?? "page";
    const scale = body.scale ?? 1;

    const op = {
        type: "request_screenshot",
        screenshotId: id,
        target,
        scale,
    } as unknown as FigmaOp;
    context.pendingOps.push(op);

    return new Promise<Response>((resolve) =>
    {
        const timer = setTimeout(() =>
        {
            context.pendingScreenshots.delete(id);
            resolve(jsonWithCors(
                { error: "screenshot timeout — plugin did not respond in time", screenshotId: id },
                { status: 504 },
                context.getCorsHeaders,
            ));
        }, timeoutMs);

        context.pendingScreenshots.set(id, {
            resolve: (images: string[]) =>
            {
                clearTimeout(timer);
                resolve(jsonWithCors({ screenshotId: id, images }, undefined, context.getCorsHeaders));
            },
            reject: (error: string) =>
            {
                clearTimeout(timer);
                resolve(jsonWithCors({ error, screenshotId: id }, { status: 500 }, context.getCorsHeaders));
            },
        });
    });
}

interface ScreenshotResultBody
{
    screenshotId?: string;
    images?: string[];
    error?: string;
}

export async function handleScreenshotResult(req: Request, context: FigmaHttpContext): Promise<Response>
{
    let body: ScreenshotResultBody;
    try { body = await req.json() as ScreenshotResultBody; }
    catch { return invalidJson(context.getCorsHeaders); }

    const id = body.screenshotId;
    if (!id) return jsonWithCors({ error: "screenshotId required" }, { status: 400 }, context.getCorsHeaders);

    const pending = context.pendingScreenshots.get(id);
    if (!pending)
        return jsonWithCors({ error: "unknown or expired screenshotId" }, { status: 404 }, context.getCorsHeaders);
    context.pendingScreenshots.delete(id);

    if (body.error) pending.reject(body.error);
    else pending.resolve(body.images ?? []);

    return jsonWithCors({ ok: true }, undefined, context.getCorsHeaders);
}
