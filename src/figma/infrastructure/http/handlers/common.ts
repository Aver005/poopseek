import type { FigmaSession } from "@/figma/application/session/session-types";
import type { FigmaChatResponse, FigmaOp } from "@/figma/api/contracts";

export interface FigmaHttpContext
{
    sessions: Map<string, FigmaSession>;
    pendingOps: FigmaOp[];
    getOrCreateSession: (sessionId?: string) => FigmaSession;
    getCorsHeaders: () => Record<string, string>;
}

export function jsonWithCors(body: unknown, init?: ResponseInit & { status?: number }, getCorsHeaders?: () => Record<string, string>): Response
{
    return Response.json(body, {
        ...init,
        headers: getCorsHeaders ? getCorsHeaders() : init?.headers,
    });
}

export function invalidJson(getCorsHeaders: () => Record<string, string>): Response
{
    return jsonWithCors({ error: "Invalid JSON" }, { status: 400 }, getCorsHeaders);
}

export function chatResponse(response: FigmaChatResponse, getCorsHeaders: () => Record<string, string>): Response
{
    return jsonWithCors(response, undefined, getCorsHeaders);
}

export function stringifyError(error: unknown): string
{
    return error instanceof Error ? error.message : String(error);
}
