import type { FigmaChatRequest, FigmaChatResponse } from "@/figma/api/contracts";
import { chatResponse, invalidJson, jsonWithCors, type FigmaHttpContext } from "./common";

export async function handleChat(req: Request, context: FigmaHttpContext): Promise<Response>
{
    let body: FigmaChatRequest;
    try
    {
        body = await req.json() as FigmaChatRequest;
    }
    catch
    {
        return invalidJson(context.getCorsHeaders);
    }

    if (!body.message?.trim())
        return jsonWithCors({ error: "message is required" }, { status: 400 }, context.getCorsHeaders);

    const session = context.getOrCreateSession(body.sessionId);
    session.lastActivityAt = Date.now();

    const response: FigmaChatResponse = {
        sessionId: session.id,
        text: "Not implemented",
        ops: [],
        agentSessions: {
            enhancer: session.roleSessions.enhancer.sessionId,
            styler: session.roleSessions.styler.sessionId,
            "primitives-builder": session.roleSessions["primitives-builder"].sessionId,
            designer: session.roleSessions.designer.sessionId,
        },
    };
    return chatResponse(response, context.getCorsHeaders);
}
