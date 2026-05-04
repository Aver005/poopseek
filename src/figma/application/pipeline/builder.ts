import ContextManager from "@/agent/context-manager";
import StreamingAgentLoop from "@/agent/streaming-loop";
import ToolExecutor from "@/agent/tool-executor";
import type { FigmaServerDeps } from "@/figma/application/server-deps";
import type { VarEntry } from "@/figma/engine/theme/var-store";

function extractJsx(text: string): string
{
    const fenced = text.match(/```(?:jsx|tsx)?\s*([\s\S]*?)```/);
    if (fenced) return fenced[1]!.trim();
    return text.trim();
}

export async function runBuilder(
    deps: FigmaServerDeps,
    contextManager: ContextManager,
    builderPromptContent: string,
    enhanced: string,
    tokens: VarEntry[],
): Promise<string>
{
    contextManager.setFigmaContext(builderPromptContent);

    const toolExecutor = new ToolExecutor(
        process.cwd(),
        undefined,
        deps.getSkillContent,
        undefined,
        undefined,
        undefined,
        undefined,
    );

    const loop = new StreamingAgentLoop(
        deps.getProvider,
        contextManager,
        toolExecutor,
        {
            maxStepsPerTurn: 8,
            maxToolsPerStep: 0,
            getCallOptions: deps.getCallOptions,
            getRequestDelay: deps.getRequestDelay,
        },
    );

    const tokenHint = tokens.length > 0
        ? "\n\nDesign tokens:\n" + tokens.map(t => `- ${t.name}: ${t.value}`).join("\n")
        : "";

    const result = await loop.runTurn(enhanced + tokenHint);
    return extractJsx(result.assistantText);
}
