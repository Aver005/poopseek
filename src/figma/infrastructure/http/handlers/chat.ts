import type { FigmaChatRequest, FigmaChatResponse } from "@/figma/api/contracts";
import { FigmaUserFacingError } from "@/figma/application/sub-agents/figma-sub-agents";
import { chatResponse, invalidJson, jsonWithCors, stringifyError, type FigmaHttpContext } from "./common";

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

    try
    {
        const text = await context.turnRunner.runOrchestratedTurn(session, body.message.trim());
        const response: FigmaChatResponse = {
            sessionId: session.id,
            text,
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
    catch (error)
    {
        if (error instanceof FigmaUserFacingError)
        {
            return chatResponse({
                sessionId: session.id,
                text: error.message,
                ops: [],
                agentSessions: error.agentSessions,
            }, context.getCorsHeaders);
        }
        return jsonWithCors({ error: stringifyError(error) }, { status: 500 }, context.getCorsHeaders);
    }
}
