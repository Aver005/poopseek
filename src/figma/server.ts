import type { Server } from "bun";
type BunServer = Server<unknown>;
import ContextManager from "@/agent/context-manager";
import StreamingAgentLoop from "@/agent/streaming-loop";
import ToolExecutor from "@/agent/tool-executor";
import type { ILLMProvider, ProviderCallOptions } from "@/providers";
import { figmaToolsRegistry, FIGMA_TOOLS_DOC } from "@/tools/defs/figma";
import { webToolNames, webToolsRegistry } from "@/tools/web-tools";
import type { VariableProcessor } from "@/variables";
import type { FigmaChatRequest, FigmaChatResponse, FigmaOp, FigmaSession } from "./types";

const DEFAULT_PORT = 7331;
const SESSION_TTL_MS = 60 * 60 * 1000;

export interface FigmaServerDeps
{
    getProvider: () => ILLMProvider;
    basePrompt: string;
    toolsPrompt: string;
    figmaPrompt: string;
    variableProcessor: VariableProcessor;
    getCallOptions?: () => ProviderCallOptions;
    getRequestDelay?: () => number;
    getWebToolsDoc?: () => string;
}


export class FigmaServerManager
{
    readonly port: number;
    private server: BunServer | null = null;
    private readonly sessions = new Map<string, FigmaSession>();
    private readonly pendingOps: FigmaOp[] = [];
    private readonly toolExecutor: ToolExecutor;
    private cleanupTimer: ReturnType<typeof setInterval> | null = null;
    private readonly deps: FigmaServerDeps;

    constructor(deps: FigmaServerDeps, port: number = DEFAULT_PORT)
    {
        this.deps = deps;
        this.port = port;
        this.toolExecutor = new ToolExecutor(
            process.cwd(),
            undefined,
            undefined,
            (name) => figmaToolsRegistry[name]
                ?? (this.deps.getWebToolsDoc?.().trim() ? webToolsRegistry[name] : undefined),
            () => [
                ...Object.keys(figmaToolsRegistry),
                ...(this.deps.getWebToolsDoc?.().trim() ? webToolNames : []),
            ],
        );
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

    private async handleRequest(req: Request): Promise<Response>
    {
        if (req.method === "OPTIONS")
        {
            return new Response(null, { status: 204, headers: this.corsHeaders() });
        }

        const url = new URL(req.url);

        if (req.method === "POST" && url.pathname === "/v1/chat")
        {
            return this.handleChat(req);
        }

        if (req.method === "POST" && url.pathname === "/v1/ops")
        {
            return this.handlePushOps(req);
        }

        if (req.method === "GET" && url.pathname === "/v1/poll-ops")
        {
            return this.handlePollOps();
        }

        if (req.method === "GET" && url.pathname === "/v1/status")
        {
            return Response.json(
                { ok: true, sessions: this.sessions.size },
                { headers: this.corsHeaders() },
            );
        }

        return new Response("Not Found", { status: 404, headers: this.corsHeaders() });
    }

    private async handlePushOps(req: Request): Promise<Response>
    {
        let body: { ops?: unknown };
        try { body = await req.json() as { ops?: unknown }; }
        catch { return Response.json({ error: "Invalid JSON" }, { status: 400, headers: this.corsHeaders() }); }
        if (Array.isArray(body.ops)) this.pendingOps.push(...(body.ops as FigmaOp[]));
        return Response.json({ ok: true }, { headers: this.corsHeaders() });
    }

    private handlePollOps(): Response
    {
        const ops = this.pendingOps.splice(0);
        return Response.json({ ops }, { headers: this.corsHeaders() });
    }

    private async handleChat(req: Request): Promise<Response>
    {
        let body: FigmaChatRequest;
        try
        {
            body = await req.json() as FigmaChatRequest;
        }
        catch
        {
            return Response.json({ error: "Invalid JSON" }, { status: 400, headers: this.corsHeaders() });
        }

        if (!body.message?.trim())
        {
            return Response.json({ error: "message is required" }, { status: 400, headers: this.corsHeaders() });
        }

        const session = this.getOrCreateSession(body.sessionId);
        session.lastActivityAt = Date.now();
        this.syncSessionRuntimeState(session);

        const textChunks: string[] = [];

        try
        {
            await session.agentLoop.runTurn(body.message, {
                onAssistantChunk: (chunk) => textChunks.push(chunk),
                onToolDone: (_toolName, result) =>
                {
                    if (result.ok && result.data)
                    {
                        if (Array.isArray(result.data))
                            this.pendingOps.push(...(result.data as FigmaOp[]));
                        else
                            this.pendingOps.push(result.data as FigmaOp);
                    }
                },
            });
        }
        catch (error)
        {
            const message = error instanceof Error ? error.message : "Unknown error";
            return Response.json({ error: message }, { status: 500, headers: this.corsHeaders() });
        }

        const response: FigmaChatResponse = {
            sessionId: session.id,
            text: textChunks.join(""),
            ops: [],
        };

        return Response.json(response, { headers: this.corsHeaders() });
    }

    private getOrCreateSession(sessionId?: string): FigmaSession
    {
        if (sessionId)
        {
            const existing = this.sessions.get(sessionId);
            if (existing) return existing;
        }

        const id = sessionId ?? crypto.randomUUID();

        const contextManager = new ContextManager(
            this.deps.basePrompt,
            this.deps.toolsPrompt,
            { maxMessages: 40 },
            this.deps.variableProcessor,
        );
        contextManager.setFigmaContext(this.buildFigmaSystemPrompt());
        contextManager.setWebToolsDoc(this.deps.getWebToolsDoc?.() ?? "");

        const agentLoop = new StreamingAgentLoop(
            () => this.deps.getProvider(),
            contextManager,
            this.toolExecutor,
            {
                maxStepsPerTurn: 64,
                maxToolsPerStep: 1,
                getCallOptions: () => this.deps.getCallOptions?.() ?? {},
                getRequestDelay: () => this.deps.getRequestDelay?.() ?? 0,
            },
        );

        const session: FigmaSession = {
            id,
            contextManager,
            agentLoop,
            createdAt: Date.now(),
            lastActivityAt: Date.now(),
        };

        this.sessions.set(id, session);
        return session;
    }

    private syncSessionRuntimeState(session: FigmaSession): void
    {
        session.contextManager.setFigmaContext(this.buildFigmaSystemPrompt());
        session.contextManager.setWebToolsDoc(this.deps.getWebToolsDoc?.() ?? "");
    }

    private buildFigmaSystemPrompt(): string
    {
        return [this.deps.figmaPrompt, "", FIGMA_TOOLS_DOC].join("\n");
    }

    private cleanupSessions(): void
    {
        const now = Date.now();
        for (const [id, session] of this.sessions)
        {
            if (now - session.lastActivityAt > SESSION_TTL_MS)
            {
                this.sessions.delete(id);
            }
        }
    }
}
