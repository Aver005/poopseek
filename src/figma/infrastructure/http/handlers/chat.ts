import fs from "node:fs/promises";
import { resolveExistingAssetPath } from "@/cli/prompt-files";
import type { FigmaChatRequest, FigmaChatResponse } from "@/figma/api/contracts";
import type { FigmaSession } from "@/figma/application/session/session-types";
import type { FigmaServerDeps } from "@/figma/application/server-deps";
import type { FigmaPluginSnapshot } from "@/figma/domain/plugin/snapshot-types";
import { runIntentClassifier } from "@/figma/application/pipeline/intent";
import { isStructuredBrief } from "@/figma/application/pipeline/brief-heuristics";
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

/**
 * Serialize a single buffer node as JSX with NO children. Used by the
 * surgical edit path so we can re-compile just the props of an existing
 * node (gap, fill, padding…) and let the plugin REUSE the figma node
 * without wiping its descendants. The plugin's `create_*` handlers
 * overwrite only what's in the op, so untouched descendants survive.
 */
function singleNodeJsx(node: { id: string; type: string; props: Record<string, unknown> }): string
{
    const tag = node.type;
    const skipKeys = new Set(["text", "content", "id"]);
    const parts: string[] = [`key="${node.id}"`];
    for (const [key, value] of Object.entries(node.props))
    {
        if (skipKeys.has(key)) continue;
        if (value === undefined || value === null || value === false) continue;
        if (value === true) parts.push(key);
        else if (typeof value === "number") parts.push(`${key}={${value}}`);
        else
        {
            const s = String(value);
            parts.push(s.includes('"') ? `${key}='${s}'` : `${key}="${s}"`);
        }
    }
    const textVal = node.props.text ?? node.props.content;
    if (typeof textVal === "string" && textVal.trim() !== "")
        return `<${tag} ${parts.join(" ")}>${textVal.trim()}</${tag}>`;
    return `<${tag} ${parts.join(" ")} />`;
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
        // User already wrote a detailed brief — don't paraphrase it through
        // the enhancer (would lose specificity). Schema-section sniff also
        // gives us the intent for free, no LLM round-trip.
        const brief = isStructuredBrief(body.message);
        if (brief.yes)
        {
            intent = brief.score.intent ?? (hasDesign ? "edit" : "create");
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
                        const allRoots = session.buffer.roots();
                        const keepNames = allRoots
                            .map((r) => String(r.props.name ?? r.id))
                            .filter(Boolean);

                        // Diff buffer state before/after to categorize each
                        // node as created / edited / deleted. The previous
                        // implementation always wiped + recreated the entire
                        // dirty root, which round-tripped untouched nodes
                        // through compileJsx and lost any plugin-side detail
                        // the JSON snapshot couldn't capture (SVG icons, fine
                        // padding/color bindings the serializer doesn't fully
                        // restore). The fix: detect the common "pure additive"
                        // case (only new subtrees, no existing-node edits or
                        // deletions) and surgically attach the new subtrees
                        // to existing parents — leaving every other node on
                        // the canvas untouched.
                        const beforeNodes = snap.nodes;
                        const afterNodes  = session.buffer.snapshot().nodes;

                        const createdIds = new Set<string>();
                        const editedIds  = new Set<string>();
                        const deletedIds = new Set<string>();
                        // Parents whose children-array order changed (no
                        // creates/deletes affecting that parent — just a
                        // reorder via `buffer.reorder`, e.g. when the LLM
                        // emits a positional diff like
                        //   <Frame key="LandingPage">
                        //     <Frame key="Footer" old />
                        //     <Frame key="BooksSection" />
                        //   </Frame>
                        // Without this set, the diff would fall through to
                        // wipe+recreate even though only positions changed.
                        const reorderedParentIds = new Set<string>();

                        for (const [id, node] of afterNodes)
                        {
                            const before = beforeNodes.get(id);
                            if (!before)
                            {
                                createdIds.add(id);
                                continue;
                            }
                            if (before.parentId !== node.parentId)
                            {
                                editedIds.add(id);
                                continue;
                            }
                            const allPropKeys = new Set([
                                ...Object.keys(before.props),
                                ...Object.keys(node.props),
                            ]);
                            for (const key of allPropKeys)
                            {
                                if (key === "id") continue;
                                if (before.props[key] !== node.props[key])
                                {
                                    editedIds.add(id);
                                    break;
                                }
                            }
                            if (editedIds.has(id)) continue;
                            // Children-order check (same length → reorder).
                            // Different length = adds/removes which are
                            // already categorized via createdIds/deletedIds.
                            if (before.children.length === node.children.length)
                            {
                                for (let i = 0; i < before.children.length; i++)
                                {
                                    if (before.children[i] !== node.children[i])
                                    {
                                        reorderedParentIds.add(id);
                                        break;
                                    }
                                }
                            }
                        }
                        for (const id of beforeNodes.keys())
                            if (!afterNodes.has(id)) deletedIds.add(id);

                        // Surgical edits handle prop changes on existing
                        // nodes by emitting `ensure_existing` (find figma
                        // node by name, populate nodeMap) + a single-node
                        // re-compile (which the plugin treats as REUSE-by-id
                        // and re-applies only the props in the op). Children
                        // are not touched. The only thing we still don't
                        // surgically handle is deletions — those fall back
                        // to wipe+recreate.
                        const surgical = deletedIds.size === 0;
                        const hasChanges = createdIds.size > 0
                            || editedIds.size > 0
                            || reorderedParentIds.size > 0;

                        if (surgical && hasChanges)
                        {
                            // Surgical path. For every created node whose
                            // parent is NOT also new (= top of a new subtree),
                            // emit `compileJsx(…, parentFrameId)` so the plugin
                            // attaches the new ops to the existing parent
                            // frame via resolveParent. Nothing else is touched.
                            for (const id of createdIds)
                            {
                                const node = afterNodes.get(id)!;
                                const parentId = node.parentId;
                                const parentIsNew = parentId !== null && createdIds.has(parentId);
                                if (parentIsNew) continue;

                                const subtreeJsx = session.buffer.subtreeToJsx(id);
                                if (!subtreeJsx) continue;
                                const parentFrameId = parentId ?? undefined;
                                opsToDispatch.push(...compileJsx(parseJsx(mapKeyToId(subtreeJsx)), parentFrameId));

                                // Plugin's create_* handlers always
                                // `appendChild`, so by default the new
                                // subtree lands at the END of the parent's
                                // children. If the diff placed it earlier
                                // in the order (e.g. before a `Footer old`),
                                // we need to reorder explicitly. Emit a
                                // `set_child_index` op pointing at the new
                                // top-of-subtree with its target position
                                // taken from the buffer state.
                                if (parentId)
                                {
                                    const parentNode = afterNodes.get(parentId);
                                    if (parentNode)
                                    {
                                        const targetIndex = parentNode.children.indexOf(id);
                                        const lastIndex   = parentNode.children.length - 1;
                                        if (targetIndex >= 0 && targetIndex < lastIndex)
                                        {
                                            opsToDispatch.push({
                                                type: "set_child_index",
                                                nodeId: id,
                                                index: targetIndex,
                                            });
                                        }
                                    }
                                }
                            }

                            // Edits. For each node whose props changed
                            // (or that moved to a new parent), emit a tiny
                            // recompile of JUST that node — no children.
                            // The plugin sees `ensure_existing` first
                            // (populates nodeMap with the figma id, found
                            // via deep findOne by name), then a `create_*`
                            // op that REUSEs the node and re-applies only
                            // the props in the op. Existing descendants and
                            // siblings are untouched. This is what stopped
                            // the gap="xl" edit on StillsScroll from wiping
                            // the whole LandingPage and losing token bindings.
                            for (const id of editedIds)
                            {
                                const node = afterNodes.get(id);
                                if (!node) continue;
                                const parentId = node.parentId;
                                const parentFrameId = parentId ?? undefined;

                                opsToDispatch.push({
                                    type: "ensure_existing",
                                    logicalId: id,
                                    name: String(node.props.name ?? id),
                                });
                                const jsx = singleNodeJsx(node);
                                opsToDispatch.push(...compileJsx(parseJsx(mapKeyToId(jsx)), parentFrameId));
                            }

                            // Reorders. For each parent with a changed
                            // children-array order, emit `set_child_index`
                            // for every position that differs from before.
                            // The plugin's `insertChild` cascades naturally:
                            // moving a node to index N shifts the rest, and
                            // the next op corrects the next position if
                            // needed. Untouched children stay put.
                            for (const parentId of reorderedParentIds)
                            {
                                const parentBefore = beforeNodes.get(parentId);
                                const parentAfter  = afterNodes.get(parentId);
                                if (!parentBefore || !parentAfter) continue;
                                for (let i = 0; i < parentAfter.children.length; i++)
                                {
                                    if (parentBefore.children[i] !== parentAfter.children[i])
                                    {
                                        opsToDispatch.push({
                                            type: "set_child_index",
                                            nodeId: parentAfter.children[i],
                                            index: i,
                                        });
                                    }
                                }
                            }
                        }
                        else
                        {
                            // Mixed case (props changed on existing nodes or
                            // deletions present): fall back to root-level
                            // wipe + recreate. Surgical per-prop set_* ops
                            // would be cleaner but require buffer-side
                            // per-prop change tracking — a deeper change
                            // deferred for now.
                            const dirtyMap = session.buffer.getDirtyLevel1Map();
                            const dirtyRootIds = new Set<string>();
                            for (const [id, info] of dirtyMap)
                                dirtyRootIds.add(info.parentId ?? id);
                            const dirtyRoots = allRoots.filter((r) => dirtyRootIds.has(r.id));

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
