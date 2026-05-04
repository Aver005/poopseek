import type { Server } from "bun";
type BunServer = Server<unknown>;
import type { FigmaOp } from "@/figma/api/contracts";
import type { FigmaServerDeps } from "@/figma/application/server-deps";
import { createFigmaSession } from "@/figma/application/session/session-factory";
import type { FigmaSession } from "@/figma/application/session/session-types";
import { handleChat } from "@/figma/infrastructure/http/handlers/chat";
import type { FigmaHttpContext } from "@/figma/infrastructure/http/handlers/common";
import { handlePollOps, handlePushOps } from "@/figma/infrastructure/http/handlers/ops";
import { handlePushSnapshot } from "@/figma/infrastructure/http/handlers/snapshot";
import { handleStatus } from "@/figma/infrastructure/http/handlers/status";

const DEFAULT_PORT = 7331;
const SESSION_TTL_MS = 60 * 60 * 1000;

export type { FigmaServerDeps };

export class FigmaServerManager
{
    readonly port: number;
    private server: BunServer | null = null;
    private readonly sessions = new Map<string, FigmaSession>();
    private readonly pendingOps: FigmaOp[] = [];
    private cleanupTimer: ReturnType<typeof setInterval> | null = null;
    private readonly deps: FigmaServerDeps;

    constructor(deps: FigmaServerDeps, port: number = DEFAULT_PORT)
    {
        this.deps = deps;
        this.port = port;
    }

    get isRunning(): boolean
    {
        return this.server !== null;
    }

    async start(): Promise<void>
    {
        if (this.server) return;
        this.server = Bun.serve({
            port: this.port,
            fetch: (req) => this.handleRequest(req),
        });
        this.cleanupTimer = setInterval(() => this.cleanupSessions(), 5 * 60 * 1000);
    }

    async stop(): Promise<void>
    {
        if (this.cleanupTimer)
        {
            clearInterval(this.cleanupTimer);
            this.cleanupTimer = null;
        }
        this.server?.stop();
        this.server = null;
        this.sessions.clear();
        this.pendingOps.length = 0;
    }

    private corsHeaders(): Record<string, string>
    {
        return {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
        };
    }

    private buildHttpContext(): FigmaHttpContext
    {
        return {
            sessions: this.sessions,
            pendingOps: this.pendingOps,
            getOrCreateSession: (sessionId?: string) => this.getOrCreateSession(sessionId),
            getCorsHeaders: () => this.corsHeaders(),
            deps: this.deps,
        };
    }

    private async handleRequest(req: Request): Promise<Response>
    {
        if (req.method === "OPTIONS")
            return new Response(null, { status: 204, headers: this.corsHeaders() });

        const url = new URL(req.url);
        const httpContext = this.buildHttpContext();

        if (req.method === "POST" && url.pathname === "/v1/chat")
            return handleChat(req, httpContext);

        if (req.method === "POST" && url.pathname === "/v1/ops")
            return handlePushOps(req, httpContext);

        if (req.method === "GET" && url.pathname === "/v1/poll-ops")
            return handlePollOps(httpContext);

        if (req.method === "POST" && url.pathname === "/v1/snapshot")
            return handlePushSnapshot(req, httpContext);

        if (req.method === "GET" && url.pathname === "/v1/status")
            return handleStatus(httpContext);

        return new Response("Not Found", { status: 404, headers: this.corsHeaders() });
    }

    private getOrCreateSession(sessionId?: string): FigmaSession
    {
        if (sessionId)
        {
            const existing = this.sessions.get(sessionId);
            if (existing) return existing;
        }

        const session = createFigmaSession({
            deps: this.deps,
            pendingOps: this.pendingOps,
            sessionId,
        });
        this.sessions.set(session.id, session);
        return session;
    }

    private cleanupSessions(): void
    {
        const now = Date.now();
        for (const [id, session] of this.sessions)
        {
            if (now - session.lastActivityAt > SESSION_TTL_MS)
                this.sessions.delete(id);
        }
    }
}
