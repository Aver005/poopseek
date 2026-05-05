import path from "node:path";
import type { FigmaChatRequest, FigmaChatResponse } from "@/figma/api/contracts";
import { runEnhancer } from "@/figma/application/pipeline/enhancer";
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
import { makeHandymanTools } from "@/figma/engine/handyman/handyman-tools";
import { saveHandymanHistory } from "@/figma/application/persistence/session-store";
import { chatResponse, invalidJson, jsonWithCors, type FigmaHttpContext } from "./common";

const WORKSPACE_ROOT = process.cwd();

async function readPrompt(name: string): Promise<string>
{
    const file = Bun.file(path.join(WORKSPACE_ROOT, "assets", "prompts", "figma", name));
    return file.text();
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

    let assistantText = "";

    if (session.mode === "create")
    {
        const [enhancerPrompt, designerPrompt, builderPrompt] = await Promise.all([
            readPrompt("enhancer.prompt.md"),
            readPrompt("designer.prompt.md"),
            readPrompt("main.prompt.md"),
        ]);

        const enhanced = await runEnhancer(subAgentRunner, body.message, enhancerPrompt);
        const tokens = await runDesigner(subAgentRunner, enhanced, designerPrompt);

        session.varStore.setTokens(tokens);

        const themeTokens = session.varStore.extractThemeTokens();
        if (themeTokens.length > 0)
            setActiveTheme({ tokens: themeTokens });

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
        const handymanPrompt = await readPrompt("handyman.prompt.md");
        const currentJsx = session.lastJsx || session.lastSnapshot?.jsx || "(empty)";
        const systemPrompt = handymanPrompt.replace("{{CURRENT_JSX}}", currentJsx);

        const handymanCtx = session.roleSessions.designer.contextManager;
        handymanCtx.setFigmaContext(systemPrompt);

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
            loopResult = await loop.runTurn(body.message);
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

        const bufferJsx = session.buffer.toJsx();
        if (bufferJsx)
        {
            session.lastJsx = bufferJsx;
            const ops = compileJsx(parseJsx(bufferJsx));
            session.dispatchOps(ops);
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
