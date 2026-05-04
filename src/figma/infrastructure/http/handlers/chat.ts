import path from "node:path";
import type { FigmaChatRequest, FigmaChatResponse } from "@/figma/api/contracts";
import { runEnhancer } from "@/figma/application/pipeline/enhancer";
import { runDesigner } from "@/figma/application/pipeline/designer";
import { runBuilder } from "@/figma/application/pipeline/builder";
import { SubAgentRunner } from "@/agent/sub-agent";
import StreamingAgentLoop from "@/agent/streaming-loop";
import ToolExecutor from "@/agent/tool-executor";
import { compileJsx } from "@/figma/engine/jsx/jsx-compiler";
import { parseJsx } from "@/figma/engine/jsx/jsx-parser";
import { setActiveTheme } from "@/figma/engine/theme/theme-state";
import { mapKeyToId } from "@/figma/engine/jsx/jsx-key-mapper";
import { makeHandymanTools } from "@/figma/engine/handyman/handyman-tools";
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
            readPrompt("builder.prompt.md"),
        ]);

        const enhanced = await runEnhancer(subAgentRunner, body.message, enhancerPrompt);
        const tokens = await runDesigner(subAgentRunner, enhanced, designerPrompt);

        session.varStore.setTokens(tokens);

        const themeTokens = session.varStore.extractThemeTokens();
        if (themeTokens.length > 0)
            setActiveTheme({ tokens: themeTokens });

        const builderCtx = session.roleSessions["primitives-builder"].contextManager;
        const jsx = await runBuilder(deps, builderCtx, builderPrompt, enhanced, tokens);

        session.lastJsx = jsx;

        const mapped = mapKeyToId(jsx);
        const ops = compileJsx(parseJsx(mapped));
        session.dispatchOps(ops);

        assistantText = jsx;
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

        const result = await loop.runTurn(body.message);
        assistantText = result.assistantText;

        const bufferJsx = session.buffer.toJsx();
        if (bufferJsx)
        {
            session.lastJsx = bufferJsx;
            const ops = compileJsx(parseJsx(bufferJsx));
            session.dispatchOps(ops);
        }
    }

    const response: FigmaChatResponse = {
        sessionId: session.id,
        text: assistantText,
        ops: [],
    };
    return chatResponse(response, context.getCorsHeaders);
}
