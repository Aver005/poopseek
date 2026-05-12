import { jsonWithCors, type FigmaHttpContext } from "./common";

export function handleStatus(context: FigmaHttpContext): Response
{
    return jsonWithCors(
        {
            ok: true,
            sessions: context.sessions.size,
            pendingOps: context.pendingOps.length,
            pendingScreenshots: context.pendingScreenshots.size,
        },
        undefined,
        context.getCorsHeaders,
    );
}
