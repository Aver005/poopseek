import type { FigmaSnapshotRequest } from "@/figma/api/contracts";
import type { FigmaSnapshotNode } from "@/figma/domain/plugin/snapshot-types";
import { loadHandymanHistory } from "@/figma/application/persistence/session-store";
import { invalidJson, jsonWithCors, type FigmaHttpContext } from "./common";

function hasFrameNodes(nodes: FigmaSnapshotNode[]): boolean
{
    for (const node of nodes)
    {
        if (node.type === "FRAME") return true;
        if (node.children && hasFrameNodes(node.children)) return true;
    }
    return false;
}

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

    if (!body.snapshot || !Array.isArray(body.snapshot.tree))
        return jsonWithCors({ error: "snapshot is required" }, { status: 400 }, context.getCorsHeaders);

    const session = context.getOrCreateSession(body.sessionId);

    session.lastActivityAt = Date.now();
    session.lastSnapshot = body.snapshot;
    session.mode = hasFrameNodes(body.snapshot.tree) ? "edit" : "create";

    if (body.snapshot.jsx)
        session.lastJsx = body.snapshot.jsx;

    const documentName = body.snapshot.documentName ?? "";
    if (documentName && documentName !== session.documentName)
    {
        session.documentName = documentName;
        session.historyLoaded = false;
    }

    if (!session.historyLoaded && session.documentName)
    {
        session.historyLoaded = true;
        const saved = await loadHandymanHistory(session.documentName);
        if (saved)
        {
            const handymanCtx = session.roleSessions.designer.contextManager;
            handymanCtx.restoreState(saved);
        }
    }

    return jsonWithCors({ ok: true, sessionId: session.id }, undefined, context.getCorsHeaders);
}
