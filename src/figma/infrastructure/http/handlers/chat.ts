import fs from "node:fs/promises";
import { resolveExistingAssetPath } from "@/cli/prompt-files";
import type { FigmaChatRequest, FigmaChatResponse } from "@/figma/api/contracts";
import type { FigmaSession } from "@/figma/application/session/session-types";
import type { FigmaServerDeps } from "@/figma/application/server-deps";
import type { FigmaPluginSnapshot } from "@/figma/domain/plugin/snapshot-types";
import { runIntentClassifier } from "@/figma/application/pipeline/intent";
import { runDesigner } from "@/figma/application/pipeline/designer";
import { runBuilderOneShot } from "@/figma/application/pipeline/builder";
import { runHandymanEdit } from "@/figma/application/pipeline/handyman";
// componentize is parked — see chat handler below for rationale.
// import { componentize } from "@/figma/application/pipeline/componentize";
import { SubAgentRunner } from "@/agent/sub-agent";
import { compileJsx } from "@/figma/engine/jsx/jsx-compiler";
import { parseJsx } from "@/figma/engine/jsx/jsx-parser";
import { validateJsxTree, formatJsxValidationErrors } from "@/figma/engine/jsx/jsx-validator";
import { setActiveTheme, resetActiveTheme, describeActiveTokensForPrompt, getActiveDesignDoc } from "@/figma/engine/theme/theme-state";
import { mapKeyToId } from "@/figma/engine/jsx/jsx-key-mapper";
import { loadNodesIntoBuffer } from "@/figma/engine/handyman/handyman-tools";
import { chatResponse, invalidJson, jsonWithCors, type FigmaHttpContext } from "./common";

const WORKSPACE_ROOT = process.cwd();

const EDIT_KEYWORDS = [
    "поменя", "измен", "смен", "замен", "передел", "поправ", "исправ", "удали", "убра", "добав",
    "постав", "передвин", "подвин", "сдви", "перетащ", "увелич", "уменьш", "растя", "сж",
    "change", "replace", "swap", "update", "edit", "modify", "remove", "delete", "add",
    "move", "resize", "increase", "decrease", "fix", "adjust", "tweak", "revert",
];

/**
 * Find the rightmost edge of any existing top-level frame on the canvas
 * and return `that + 80` (gutter). Used to place a new "create" root next
 * to existing designs instead of on top of them. Returns 0 if there's
 * nothing to dodge.
 */
function computeNextRootX(snapshot?: FigmaPluginSnapshot | null): number
{
    const tree = snapshot?.tree ?? [];
    if (tree.length === 0) return 0;
    let rightmost = 0;
    for (const root of tree)
    {
        const x = typeof root.x === "number" ? root.x : 0;
        const w = typeof root.width === "number" ? root.width : 0;
        rightmost = Math.max(rightmost, x + w);
    }
    return rightmost > 0 ? rightmost + 80 : 0;
}

function looksLikeEdit(message: string): boolean
{
    const lower = message.toLowerCase();
    return EDIT_KEYWORDS.some(kw => lower.includes(kw));
}

async function readPrompt(name: string): Promise<string>
{
    const resolved = resolveExistingAssetPath(`assets/prompts/figma/${name}`);
    return fs.readFile(resolved, "utf8");
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

    // Image attachments flow directly to every sub-agent (intent → designer
    // → builder/handyman) via provider.withImages(). Each agent sees the
    // original picture rather than a paraphrased description, so no agent
    // hallucinates details that downstream stages then amplify.
    const images = body.images?.length ? body.images : undefined;
    let visionAttached = false;
    let visionError: string | null = null;
    if (images)
    {
        const totalBytes = images.reduce((s, i) => s + i.data.length, 0);
        const provider = deps.getProvider();
        console.log(`[vision] received ${images.length} image(s), ~${Math.round(totalBytes * 0.75 / 1024)} KB, provider=${provider.info.id}`);
        if (!provider.withImages)
        {
            visionError = `Активный провайдер "${provider.info.id}" не поддерживает изображения`;
            console.warn(`[vision] ${visionError}`);
        }
        else
        {
            visionAttached = true;
        }
    }

    let intent: "create" | "edit";
    let enhanced: string;

    if (hasDesign && looksLikeEdit(body.message))
    {
        intent = "edit";
        enhanced = body.message;
    }
    else
    {
        // Skip enhance-cache when images are present — same text + different
        // image must produce a fresh enhanced prompt.
        const cached = !images ? context.enhanceCache.get(body.message) : null;
        if (cached)
        {
            intent = "create";
            enhanced = cached.enhanced;
        }
        else
        {
            const result = await runIntentClassifier(
                subAgentRunner, body.message, currentJsx, intentPrompt, undefined,
                visionAttached ? images : undefined,
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
            visionAttached ? images : undefined,
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
                if (images)
                {
                    send("vision", {
                        ok: visionAttached,
                        error: visionError,
                        count: images.length,
                        sessionId: session.id,
                    });
                }
                send("intent", { intent, enhanced, sessionId: session.id });

                if (intent === "create")
                {
                    // Fresh design intent → fresh theme. Otherwise tokens
                    // from previous sessions linger via the first-wins
                    // merge in setActiveTheme (e.g. background=#0D1117
                    // from a cyberpunk theme still showing in the prompt
                    // when the new design is an editorial light layout).
                    resetActiveTheme();

                    const designerOut = await runDesigner(
                        subAgentRunner, enhanced, designerPrompt, undefined,
                        visionAttached ? images : undefined,
                    );
                    console.log(`[designer] returned: tokens=${designerOut.tokens.length}, themeTokens=${designerOut.themeTokens.length}, components=${designerOut.components.length} [${designerOut.components.map((c) => c.name).join(", ")}]`);

                    session.varStore.setTokens(designerOut.tokens);

                    setActiveTheme({
                        name: designerOut.name,
                        tokens: designerOut.themeTokens,
                        components: designerOut.components,
                        prose: designerOut.prose,
                    });

                    context.enhanceCache.set(body.message, { enhanced, tokens: designerOut.tokens });

                    send("tokens", { tokens: designerOut.tokens, sessionId: session.id });
                    const tokens = designerOut.tokens; // keep below variable name stable

                    // Builder produces a flat inline-frame screen — no Instance
                    // expectations. Reusable patterns are extracted AFTER, by
                    // the deterministic componentizer below.
                    const builderPromptWithTokens = builderPrompt
                        .replace("{{TOKENS_TABLE}}", describeActiveTokensForPrompt() || "(no tokens defined)")
                        .replace("{{DESIGN_DOC}}", getActiveDesignDoc() || "(no DESIGN.md prose available)");
                    const result = await runBuilderOneShot(
                        deps.getProvider, builderPromptWithTokens, enhanced, tokens, undefined,
                        visionAttached ? images : undefined,
                        [], // registeredComponents — none yet, builder writes inline
                    );

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

                    // ─── Componentize: PARKED for now ─────────────────────
                    // The deterministic componentizer (see componentize.ts)
                    // had several practical issues that degraded visual
                    // quality vs. plain inline output:
                    //   1. Text overrides only fill the FIRST text slot —
                    //      multi-text components (Card with title+desc+price)
                    //      get all text concatenated into the title.
                    //   2. Instances render at master-fixed size; they don't
                    //      inherit `width="fill"` from the screen parent, so
                    //      grids of Instances collapse.
                    //   3. Cascading extraction (ProductCard contains
                    //      BuyButton, both detected) leaves orphaned refs
                    //      and produces redundant masters.
                    //   4. Two identical small frames (e.g. LogoIcon Rect)
                    //      shouldn't always become a Component — too small
                    //      to benefit.
                    // Re-enabling requires per-slot text override, sizing
                    // hints, parent-aware instance compilation, and quality
                    // filters. Until then we ship the builder's inline JSX
                    // verbatim — same architecture as before componentize.
                    const ops = compileJsx(parsedNodes);

                    session.lastJsx = result.jsx;
                    session.mode = "edit";

                    // If we already have a design on the canvas, place the
                    // new root next to it instead of on top. We mutate the
                    // first parent-less create_frame op (= the new root) and
                    // set its `x` to the rightmost edge + 80px gutter.
                    if (hasDesign)
                    {
                        const offsetX = computeNextRootX(session.lastSnapshot);
                        if (offsetX > 0)
                        {
                            const rootOp = ops.find((o) =>
                                (o as Record<string, unknown>).type === "create_frame"
                                && (o as Record<string, unknown>).frameId === undefined
                            ) as Record<string, unknown> | undefined;
                            if (rootOp && rootOp.x === undefined)
                                rootOp.x = offsetX;
                        }
                    }

                    // SSE-only path: do NOT push to pendingOps. The plugin
                    // resumes polling /poll-ops as soon as the SSE stream
                    // closes (`usingSse = false`), so anything left there
                    // re-runs as a second EXECUTE_OPS batch and we get TWO
                    // duplicate roots on the canvas.
                    send("ops", { ops, sessionId: session.id });
                    send("done", { sessionId: session.id, text: result.jsx });
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
                    const systemPrompt = handymanPromptContent
                        .replace("{{CURRENT_JSX}}", canonicalJsx)
                        .replace("{{TOKENS_TABLE}}", describeActiveTokensForPrompt() || "(no tokens defined)")
                        .replace("{{DESIGN_DOC}}", getActiveDesignDoc() || "(no DESIGN.md prose available)");

                    const snap = session.buffer.snapshot();
                    const handymanResult = await runHandymanEdit(
                        deps.getProvider,
                        systemPrompt,
                        enhanced,
                        session.buffer,
                        deps.getCallOptions?.(),
                        visionAttached ? images : undefined,
                    );

                    if (!handymanResult.ok)
                    {
                        session.buffer.restore(snap);
                        send("error", { error: handymanResult.error, sessionId: session.id });
                        controller.close();
                        return;
                    }

                    if (session.buffer.isDirty)
                    {
                        const bufferJsx = session.buffer.toJsx();
                        if (bufferJsx) session.lastJsx = bufferJsx;

                        const opsToDispatch: ReturnType<typeof compileJsx> = [];

                        // All frame names we own — sent on each clear so the
                        // plugin's orphan cleanup doesn't wipe sibling roots
                        // that belong to OTHER designs created with `create`
                        // earlier in the session.
                        const allRoots = session.buffer.roots();
                        const keepNames = allRoots
                            .map((r) => String(r.props.name ?? r.id))
                            .filter(Boolean);

                        // Only touch roots that were actually edited. Untouched
                        // roots (typically marked `old` in the diff) would
                        // otherwise be wiped + re-created from the buffer JSX —
                        // and that round-trip silently strips SVG icon content
                        // because the snapshot serializer can't preserve vector
                        // children produced by figma.createNodeFromSvg. Result
                        // before this guard: editing screen B re-rendered
                        // screen A and made its icons disappear.
                        const dirtyMap = session.buffer.getDirtyLevel1Map();
                        const dirtyRoots = allRoots.filter((r) => dirtyMap.has(r.id));

                        for (const root of dirtyRoots)
                        {
                            const frameName = String(root.props.name ?? root.id);
                            if (frameName)
                                opsToDispatch.push({ type: "clear_frame_children", frameName, keepNames });
                        }

                        for (const root of dirtyRoots)
                        {
                            const subtreeJsx = session.buffer.subtreeToJsx(root.id);
                            if (subtreeJsx)
                                opsToDispatch.push(...compileJsx(parseJsx(mapKeyToId(subtreeJsx))));
                        }

                        if (opsToDispatch.length > 0)
                        {
                            // Same anti-double-dispatch reasoning as the
                            // create branch: SSE delivery only.
                            send("ops", { ops: opsToDispatch, sessionId: session.id });
                        }

                        if (bufferJsx)
                            send("debug-jsx", { jsx: bufferJsx, sessionId: session.id });
                    }

                    send("done", { sessionId: session.id, text: handymanResult.assistantText });
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
    images?: import("@/providers/types").ChatImage[],
): Promise<Response>
{
    let assistantText = "";

    if (intent === "create")
    {
        const designerOut = await runDesigner(subAgentRunner, enhanced, designerPrompt, undefined, images);
        const tokens = designerOut.tokens;

        session.varStore.setTokens(tokens);

        setActiveTheme({
            name: designerOut.name,
            tokens: designerOut.themeTokens,
            components: designerOut.components,
            prose: designerOut.prose,
        });

        context.enhanceCache.set(message, { enhanced, tokens });

        const result = await runBuilderOneShot(deps.getProvider, builderPrompt, enhanced, tokens, undefined, images, []);

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

        const snap = session.buffer.snapshot();
        const handymanResult = await runHandymanEdit(
            deps.getProvider,
            systemPrompt,
            enhanced,
            session.buffer,
            deps.getCallOptions?.(),
            images,
        );

        if (!handymanResult.ok)
        {
            session.buffer.restore(snap);
            return jsonWithCors(
                { error: handymanResult.error, sessionId: session.id },
                { status: 500 },
                context.getCorsHeaders,
            );
        }

        assistantText = handymanResult.assistantText;

        if (session.buffer.isDirty)
        {
            const bufferJsx = session.buffer.toJsx();
            if (bufferJsx) session.lastJsx = bufferJsx;

            const opsToDispatch: ReturnType<typeof compileJsx> = [];

            const rootNames = session.buffer.roots()
                .map(n => String(n.props.name ?? n.id))
                .filter(Boolean);
            if (rootNames.length > 0)
                opsToDispatch.push({ type: "delete_nodes_by_name", names: rootNames });

            if (bufferJsx)
                opsToDispatch.push(...compileJsx(parseJsx(mapKeyToId(bufferJsx))));

            if (opsToDispatch.length > 0)
                session.dispatchOps(opsToDispatch);
        }
    }

    const response: FigmaChatResponse = {
        sessionId: session.id,
        text: assistantText,
        ops: [],
    };
    return chatResponse(response, context.getCorsHeaders);
}
