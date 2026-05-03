import type { FigmaOp } from "@/figma/api/contracts";
import { invalidJson, jsonWithCors, type FigmaHttpContext } from "./common";

export async function handlePushOps(req: Request, context: FigmaHttpContext): Promise<Response>
{
    let body: { ops?: unknown };
    try
    {
        body = await req.json() as { ops?: unknown };
    }
    catch
    {
        return invalidJson(context.getCorsHeaders);
    }

    if (Array.isArray(body.ops))
        context.pendingOps.push(...(body.ops as FigmaOp[]));

    return jsonWithCors({ ok: true }, undefined, context.getCorsHeaders);
}

export function handlePollOps(context: FigmaHttpContext): Response
{
    const ops = context.pendingOps.splice(0);
    return jsonWithCors({ ops }, undefined, context.getCorsHeaders);
}
