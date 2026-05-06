import path from "node:path";
import type { FigmaChatRequest, FigmaChatResponse, FigmaOp } from "@/figma/api/contracts";
import type { FigmaSession } from "@/figma/application/session/session-types";
import type { FigmaServerDeps } from "@/figma/application/server-deps";
import { runIntentClassifier } from "@/figma/application/pipeline/intent";
import { runDesigner } from "@/figma/application/pipeline/designer";
import { runBuilderOneShot } from "@/figma/application/pipeline/builder";
import { SubAgentRunner } from "@/agent/sub-agent";
import StreamingAgentLoop from "@/agent/streaming-loop";
import ToolExecutor from "@/agent/tool-executor";
import { compileJsx } from "@/figma/engine/jsx/jsx-compiler";
import { parseJsx } from "@/figma/engine/jsx/jsx-parser";
import { validateJsxTree, formatJsxValidationErrors } from "@/figma/engine/jsx/jsx-validator";
import { setActiveTheme } from "@/figma/engine/theme/theme-state";
import { mapKeyToId } from "@/figma/engine/jsx/jsx-key-mapper";
import { makeHandymanTools, loadNodesIntoBuffer } from "@/figma/engine/handyman/handyman-tools";
import { saveHandymanHistory } from "@/figma/application/persistence/session-store";
import { chatResponse, invalidJson, jsonWithCors, type FigmaHttpContext, type SseEvent } from "./common";

const WORKSPACE_ROOT = process.cwd();

const EDIT_KEYWORDS = [
    "поменя", "измен", "смен", "замен", "передел", "поправ", "исправ", "удали", "убра", "добав",
    "постав", "передвин", "подвин", "сдви", "перетащ", "увелич", "уменьш", "растя", "сж",
    "change", "replace", "swap", "update", "edit", "modify", "remove", "delete", "add",
    "move", "resize", "increase", "decrease", "fix", "adjust", "tweak", "revert",
];

function looksLikeEdit(message: string): boolean
{
    const lower = message.toLowerCase();
    return EDIT_KEYWORDS.some(kw => lower.includes(kw));
}

async function readPrompt(name: string): Promise<string>
{
    const file = Bun.file(path.join(WORKSPACE_ROOT, "assets", "prompts", "figma", name));
    return file.text();
}

function sseEvent(event: string, data: unknown): string
{
    return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function createSseResponse(stream: ReadableStream, corsHeaders: Record<string, string> = {}): Response
{
    return new Response(stream, {
        headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            ...corsHeaders,
        },
    });
}

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

    const deps = context.deps;
    const subAgentRunner = new SubAgentRunner(deps.getProvider, WORKSPACE_ROOT);
    const acceptSse = req.headers.get("Accept")?.includes("text/event-stream");

    const [intentPrompt, designerPrompt, builderPrompt, handymanPromptContent] = await Promise.all([
        readPrompt("intent.prompt.md"),
        readPrompt("designer.prompt.md"),
        readPrompt("main.prompt.md"),
        readPrompt("handyman.prompt.md"),
    ]);

    const currentJsx = session.lastSnapshot?.jsx || session.lastJsx || "(empty)";
    const hasDesign = currentJsx !== "(empty)" && currentJsx.trim().length > 0;

    let intent: "create" | "edit";
    let enhanced: string;

    if (hasDesign && looksLikeEdit(body.message))
    {
        intent = "edit";
        enhanced = body.message;
    }
    else
    {
        const cached = context.enhanceCache.get(body.message);
        if (cached)
        {
            intent = "create";
            enhanced = cached.enhanced;
        }
        else
        {
            const result = await runIntentClassifier(
                subAgentRunner, body.message, currentJsx, intentPrompt,
            );
            intent = result.intent;
            enhanced = result.enhanced;
        }
    }

    if (!acceptSse)
    {
        return handleChatLegacy(
            intent, enhanced, body.message, session, context, deps, subAgentRunner,
            designerPrompt, builderPrompt, handymanPromptContent, currentJsx,
        );
    }

    const corsHeaders = context.getCorsHeaders();
    const stream = new ReadableStream({
        async start(controller)
        {
            const send = (event: string, data: unknown) =>
            {
                try { controller.enqueue(new TextEncoder().encode(sseEvent(event, data))); }
                catch { /* stream closed */ }
            };

            try
            {
                send("intent", { intent, enhanced, sessionId: session.id });

                if (intent === "create")
                {
                    const tokens = await runDesigner(subAgentRunner, enhanced, designerPrompt);
                    session.varStore.setTokens(tokens);

                    const themeTokens = session.varStore.extractThemeTokens();
                    if (themeTokens.length > 0)
                        setActiveTheme({ tokens: themeTokens });

                    context.enhanceCache.set(body.message, { enhanced, tokens });

                    send("tokens", { tokens, sessionId: session.id });

                    const result = await runBuilderOneShot(deps.getProvider, builderPrompt, enhanced, tokens);

                    if (!result.ok)
                    {
                        send("error", { error: result.error, sessionId: session.id });
                        controller.close();
                        return;
                    }

                    send("jsx", { jsx: result.jsx, sessionId: session.id });

                    const mapped = mapKeyToId(result.jsx);
                    const parsedNodes = parseJsx(mapped);
                    const validationErrors = validateJsxTree(parsedNodes);

                    if (validationErrors.length > 0)
                    {
                        send("error", { error: formatJsxValidationErrors(validationErrors), sessionId: session.id });
                        controller.close();
                        return;
                    }

                    session.lastJsx = result.jsx;
                    session.mode = "edit";

                    const ops = compileJsx(parsedNodes);
                    session.dispatchOps(ops);

                    send("ops", { ops, sessionId: session.id });
                    send("done", { sessionId: session.id, text: result.jsx });
                }
                else
                {
                    // Load buffer first so we can use its canonical JSX (with unique IDs) in the prompt.
                    session.buffer.reset();
                    if (currentJsx !== "(empty)")
                    {
                        try { loadNodesIntoBuffer(session.buffer, currentJsx); }
                        catch { /* ignore parse errors */ }
                    }
                    session.buffer.markClean();

                    const canonicalJsx = session.buffer.toJsx() || "(empty)";
                    const systemPrompt = handymanPromptContent.replace("{{CURRENT_JSX}}", canonicalJsx);

                    const handymanCtx = session.roleSessions.designer.contextManager;
                    handymanCtx.setFigmaContext(systemPrompt);
                    handymanCtx.clearHistory();

                    const handymanTools = makeHandymanTools(session.buffer);

                    const toolExecutor = new ToolExecutor(
                        WORKSPACE_ROOT,
                        undefined,
                        deps.getSkillContent,
                        (name) => handymanTools[name],
                        () => Object.keys(handymanTools),
                        subAgentRunner,
                        undefined,
                    );

                    const loop = new StreamingAgentLoop(
                        deps.getProvider,
                        handymanCtx,
                        toolExecutor,
                        {
                            maxStepsPerTurn: 16,
                            maxToolsPerStep: 12,
                            getCallOptions: deps.getCallOptions,
                            getRequestDelay: deps.getRequestDelay,
                        },
                    );

                    const snap = session.buffer.snapshot();
                    let loopResult: Awaited<ReturnType<typeof loop.runTurn>>;
                    try
                    {
                        loopResult = await loop.runTurn(enhanced);
                    }
                    catch (err)
                    {
                        session.buffer.restore(snap);
                        send("error", { error: err instanceof Error ? err.message : String(err), sessionId: session.id });
                        controller.close();
                        return;
                    }

                    if (session.buffer.isDirty)
                    {
                        const bufferJsx = session.buffer.toJsx();
                        if (bufferJsx) session.lastJsx = bufferJsx;

                        const opsToDispatch: ReturnType<typeof compileJsx> = [];

                        for (const deletedId of session.buffer.getDeletedIds())
                            opsToDispatch.push({ type: "delete_node", nodeId: deletedId });

                        for (const [nodeId, { parentId }] of session.buffer.getDirtyLevel1Map())
                        {
                            if (!session.buffer.get(nodeId)) continue;
                            const subtreeJsx = session.buffer.subtreeToJsx(nodeId);
                            opsToDispatch.push(...compileJsx(parseJsx(mapKeyToId(subtreeJsx)), parentId ?? undefined));
                        }

                        if (opsToDispatch.length > 0)
                        {
                            session.dispatchOps(opsToDispatch);
                            send("ops", { ops: opsToDispatch, sessionId: session.id });
                        }
                    }

                    if (session.documentName)
                    {
                        await saveHandymanHistory(session.documentName, handymanCtx.exportState()).catch(() => {});
                    }

                    send("done", { sessionId: session.id, text: loopResult.assistantText });
                }
            }
            catch (err)
            {
                send("error", { error: err instanceof Error ? err.message : String(err), sessionId: session.id });
            }
            finally
            {
                try { controller.close(); }
                catch { /* already closed */ }
            }
        },
    });

    return createSseResponse(stream, corsHeaders);
}

async function handleChatLegacy(
    intent: "create" | "edit",
    enhanced: string,
    message: string,
    session: FigmaSession,
    context: FigmaHttpContext,
    deps: FigmaServerDeps,
    subAgentRunner: SubAgentRunner,
    designerPrompt: string,
    builderPrompt: string,
    handymanPromptContent: string,
    currentJsx: string,
): Promise<Response>
{
    let assistantText = "";

    if (intent === "create")
    {
        const tokens = await runDesigner(subAgentRunner, enhanced, designerPrompt);

        session.varStore.setTokens(tokens);

        const themeTokens = session.varStore.extractThemeTokens();
        if (themeTokens.length > 0)
            setActiveTheme({ tokens: themeTokens });

        context.enhanceCache.set(message, { enhanced, tokens });

        const result = await runBuilderOneShot(deps.getProvider, builderPrompt, enhanced, tokens);

        if (!result.ok)
        {
            return jsonWithCors(
                { error: result.error, sessionId: session.id },
                { status: 500 },
                context.getCorsHeaders,
            );
        }

        const mapped = mapKeyToId(result.jsx);
        const parsedNodes = parseJsx(mapped);
        const validationErrors = validateJsxTree(parsedNodes);

        if (validationErrors.length > 0)
        {
            return jsonWithCors(
                { error: formatJsxValidationErrors(validationErrors), sessionId: session.id },
                { status: 500 },
                context.getCorsHeaders,
            );
        }

        session.lastJsx = result.jsx;
        session.mode = "edit";

        const ops = compileJsx(parsedNodes);
        session.dispatchOps(ops);

        assistantText = result.jsx;
    }
    else
    {
        session.buffer.reset();
        if (currentJsx !== "(empty)")
        {
            try { loadNodesIntoBuffer(session.buffer, currentJsx); }
            catch { /* ignore parse errors */ }
        }
        session.buffer.markClean();

        const canonicalJsx = session.buffer.toJsx() || "(empty)";
        const systemPrompt = handymanPromptContent.replace("{{CURRENT_JSX}}", canonicalJsx);

        const handymanCtx = session.roleSessions.designer.contextManager;
        handymanCtx.setFigmaContext(systemPrompt);
        handymanCtx.clearHistory();

        const handymanTools = makeHandymanTools(session.buffer);

        const toolExecutor = new ToolExecutor(
            WORKSPACE_ROOT,
            undefined,
            deps.getSkillContent,
            (name) => handymanTools[name],
            () => Object.keys(handymanTools),
            subAgentRunner,
            undefined,
        );

        const loop = new StreamingAgentLoop(
            deps.getProvider,
            handymanCtx,
            toolExecutor,
            {
                maxStepsPerTurn: 16,
                maxToolsPerStep: 12,
                getCallOptions: deps.getCallOptions,
                getRequestDelay: deps.getRequestDelay,
            },
        );

        const snap = session.buffer.snapshot();
        let loopResult: Awaited<ReturnType<typeof loop.runTurn>>;
        try
        {
            loopResult = await loop.runTurn(enhanced);
        }
        catch (err)
        {
            session.buffer.restore(snap);
            return jsonWithCors(
                { error: err instanceof Error ? err.message : String(err), sessionId: session.id },
                { status: 500 },
                context.getCorsHeaders,
            );
        }
        assistantText = loopResult.assistantText;

        if (session.buffer.isDirty)
        {
            const bufferJsx = session.buffer.toJsx();
            if (bufferJsx) session.lastJsx = bufferJsx;

            const opsToDispatch: ReturnType<typeof compileJsx> = [];

            for (const deletedId of session.buffer.getDeletedIds())
                opsToDispatch.push({ type: "delete_node", nodeId: deletedId });

            for (const [nodeId, { parentId }] of session.buffer.getDirtyLevel1Map())
            {
                if (!session.buffer.get(nodeId)) continue;
                const subtreeJsx = session.buffer.subtreeToJsx(nodeId);
                opsToDispatch.push(...compileJsx(parseJsx(mapKeyToId(subtreeJsx)), parentId ?? undefined));
            }

            if (opsToDispatch.length > 0)
                session.dispatchOps(opsToDispatch);
        }

        if (session.documentName)
        {
            await saveHandymanHistory(session.documentName, handymanCtx.exportState()).catch(() => {});
        }
    }

    const response: FigmaChatResponse = {
        sessionId: session.id,
        text: assistantText,
        ops: [],
    };
    return chatResponse(response, context.getCorsHeaders);
}
