import type { FigmaSnapshotRequest } from "@/figma/api/contracts";
import { invalidJson, jsonWithCors, type FigmaHttpContext } from "./common";

export async function handlePushSnapshot(req: Request, context: FigmaHttpContext): Promise<Response>
{
    let body: FigmaSnapshotRequest;
    try
    {
        body = await req.json() as FigmaSnapshotRequest;
    }
    catch
    {
        return invalidJson(context.getCorsHeaders);
    }

    if (!body.sessionId || !body.snapshot || !Array.isArray(body.snapshot.tree))
        return jsonWithCors({ error: "sessionId and snapshot are required" }, { status: 400 }, context.getCorsHeaders);

    const session = context.sessions.get(body.sessionId);
    if (!session)
        return jsonWithCors({ error: "Unknown session" }, { status: 404 }, context.getCorsHeaders);

    session.lastActivityAt = Date.now();
    session.lastSnapshot = body.snapshot;
    session.mode = body.snapshot.tree.length > 0 ? "edit" : "create";

    return jsonWithCors({ ok: true }, undefined, context.getCorsHeaders);
}
