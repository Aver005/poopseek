import type { FigmaServerDeps } from "@/figma/application/server-deps";
import { runEnhancerSession } from "@/figma/application/sub-agents/figma-sub-agents";
import type { FigmaSession } from "@/figma/application/session/session-types";

export async function runEnhancer(
    deps: FigmaServerDeps,
    session: FigmaSession,
    userMessage: string,
)
{
    return runEnhancerSession(deps, session, userMessage);
}

