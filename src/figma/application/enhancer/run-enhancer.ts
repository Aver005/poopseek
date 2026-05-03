import type { ProviderMessage } from "@/providers/types";
import type { FigmaServerDeps } from "@/figma/application/server-deps";
import type { FigmaRuntimeSync } from "@/figma/application/session/runtime-sync";
import { getRoleContextManager } from "@/figma/multi-session";
import { buildPreprocessUserMessage, parsePreparedBriefText } from "@/figma/preprocess";
import type { FigmaSession } from "@/figma/application/session/session-types";

export async function runEnhancer(
    deps: FigmaServerDeps,
    runtime: FigmaRuntimeSync,
    session: FigmaSession,
    userMessage: string,
)
{
    const snapshot = runtime.buildSnapshot(session);
    const enhancerContext = getRoleContextManager(session, "enhancer");
    enhancerContext.clearHistory();
    const provider = await deps.getProvider().clone();
    const messages: ProviderMessage[] = [
        ...enhancerContext.getMessages().map((message) => ({
            role: message.role === "tool" ? "assistant" : message.role,
            content: message.content,
        })) as ProviderMessage[],
        {
            role: "user",
            content: buildPreprocessUserMessage({
                userPrompt: userMessage,
                taskMode: session.orchestration.taskMode,
                snapshotSummary: snapshot.summary,
                layout: session.orchestration.layout,
            }),
        },
    ];

    const chunks: string[] = [];
    for await (const chunk of provider.complete(
        messages,
        `${deps.figmaRolePrompts.enhancer.trim()}\n\n${deps.figmaStagePrompts.preprocess.trim()}`,
        { ...(deps.getCallOptions?.() ?? {}), thinkingEnabled: false, searchEnabled: false },
    ))
        chunks.push(chunk);

    const text = chunks.join("").trim();
    enhancerContext.addUser(userMessage);
    enhancerContext.addAssistant(text);
    return parsePreparedBriefText(text, userMessage, session.orchestration.layout);
}

