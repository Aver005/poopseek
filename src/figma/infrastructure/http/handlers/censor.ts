import fs from "node:fs/promises";
import { resolveExistingAssetPath } from "@/cli/prompt-files";
import type { ChatImage, FigmaOp } from "@/figma/api/contracts";
import { runCensor, formatVerdictAsEdit, type BriefVerdict } from "@/figma/application/pipeline/censor";
import { runHandymanEdit } from "@/figma/application/pipeline/handyman";
import { loadNodesIntoBuffer } from "@/figma/engine/handyman/handyman-tools";
import { compileJsx } from "@/figma/engine/jsx/jsx-compiler";
import { mapKeyToId } from "@/figma/engine/jsx/jsx-key-mapper";
import { parseJsx } from "@/figma/engine/jsx/jsx-parser";
import { describeActiveTokensForPrompt, getActiveDesignDoc } from "@/figma/engine/theme/theme-state";
import { invalidJson, jsonWithCors, type FigmaHttpContext } from "./common";

const MAX_ITERATIONS = 3;

interface CensorRequestBody
{
    sessionId?: string;
    image?: ChatImage;
    jsx?: string;
    userRequest?: string;
    iteration?: number;
}

interface CensorResponseBody
{
    verdict: BriefVerdict;
    ops: FigmaOp[];
    done: boolean;
    iteration: number;
    error?: string;
}

async function readPrompt(name: string): Promise<string>
{
    const resolved = resolveExistingAssetPath(`assets/prompts/figma/${name}`);
    return fs.readFile(resolved, "utf8");
}

export async function handleCensor(req: Request, context: FigmaHttpContext): Promise<Response>
{
    let body: CensorRequestBody;
    try { body = await req.json() as CensorRequestBody; }
    catch { return invalidJson(context.getCorsHeaders); }

    if (!body.image?.data)
        return jsonWithCors({ error: "image required" }, { status: 400 }, context.getCorsHeaders);

    const session = context.getOrCreateSession(body.sessionId);
    session.lastActivityAt = Date.now();

    const jsx = (body.jsx?.trim() || session.lastJsx?.trim()) ?? "";
    if (!jsx)
        return jsonWithCors({ error: "no jsx in session to review" }, { status: 400 }, context.getCorsHeaders);

    const iteration = Math.max(0, Number(body.iteration ?? 0) | 0);
    const isLastIteration = iteration >= MAX_ITERATIONS - 1;

    const censorPrompt = await readPrompt("censor.prompt.md");
    const deps = context.deps;

    const verdict = await runCensor(
        deps.getProvider,
        censorPrompt,
        jsx,
        body.userRequest ?? "",
        body.image,
        deps.getCallOptions?.(),
    );

    console.log(`[censor] iter=${iteration} severity=${verdict.severity} issues=${verdict.issues.length} summary="${verdict.summary}"`);

    const respond = (data: CensorResponseBody): Response =>
        jsonWithCors(data, undefined, context.getCorsHeaders);

    if (verdict.severity === "ok" || verdict.issues.length === 0)
        return respond({ verdict, ops: [], done: true, iteration });

    if (isLastIteration)
        return respond({ verdict, ops: [], done: true, iteration });

    const handymanPrompt = await readPrompt("handyman.prompt.md");
    const editInstruction = formatVerdictAsEdit(verdict);

    session.buffer.reset();
    try { loadNodesIntoBuffer(session.buffer, jsx); }
    catch (err)
    {
        return respond({
            verdict, ops: [], done: true, iteration,
            error: `buffer load failed: ${err instanceof Error ? err.message : String(err)}`,
        });
    }
    session.buffer.markClean();

    const canonicalJsx = session.buffer.toJsx() || "(empty)";
    const systemPrompt = handymanPrompt
        .replace("{{CURRENT_JSX}}", canonicalJsx)
        .replace("{{TOKENS_TABLE}}", describeActiveTokensForPrompt() || "(no tokens defined)")
        .replace("{{DESIGN_DOC}}", getActiveDesignDoc() || "(no DESIGN.md prose available)");

    const snap = session.buffer.snapshot();
    const handymanResult = await runHandymanEdit(
        deps.getProvider,
        systemPrompt,
        editInstruction,
        session.buffer,
        deps.getCallOptions?.(),
    );

    if (!handymanResult.ok)
    {
        session.buffer.restore(snap);
        return respond({ verdict, ops: [], done: true, iteration, error: handymanResult.error });
    }

    const opsToDispatch: FigmaOp[] = [];
    if (session.buffer.isDirty)
    {
        const bufferJsx = session.buffer.toJsx();
        if (bufferJsx) session.lastJsx = bufferJsx;

        const allRoots = session.buffer.roots();
        const keepNames = allRoots
            .map((r) => String(r.props.name ?? r.id))
            .filter(Boolean);

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
    }

    const nextIteration = iteration + 1;
    const done = opsToDispatch.length === 0 || nextIteration >= MAX_ITERATIONS;
    return respond({ verdict, ops: opsToDispatch, done, iteration: nextIteration });
}
