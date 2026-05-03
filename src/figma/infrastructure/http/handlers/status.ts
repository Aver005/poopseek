import { jsonWithCors, type FigmaHttpContext } from "./common";

export function handleStatus(context: FigmaHttpContext): Response
{
    return jsonWithCors(
        { ok: true, sessions: context.sessions.size },
        undefined,
        context.getCorsHeaders,
    );
}
