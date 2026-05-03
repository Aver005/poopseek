import type ContextManager from "@/agent/context-manager";
import type StreamingAgentLoop from "@/agent/streaming-loop";
import type { PreparedDesignBrief } from "@/figma/preprocess";
import type { FigmaRole, FigmaRoleSession, FigmaSession } from "@/figma/types";

export interface RoleRunResult
{
    assistantText: string;
    usedTools: string[];
}

export function getRoleSession(session: FigmaSession, role: FigmaRole): FigmaRoleSession
{
    return session.roleSessions[role];
}

export function getRoleContextManager(session: FigmaSession, role: FigmaRole): ContextManager
{
    return getRoleSession(session, role).contextManager;
}

export function getRoleLoop(session: FigmaSession, role: Exclude<FigmaRole, "enhancer">): StreamingAgentLoop
{
    const loop = getRoleSession(session, role).agentLoop;
    if (!loop) throw new Error(`Role ${role} has no agent loop`);
    return loop;
}

export function roleHeader(role: FigmaRole): string
{
    if (role === "enhancer") return "ENHANCER";
    if (role === "designer") return "DESIGNER";
    if (role === "builder") return "BUILDER";
    return "COMPOSER";
}

export function buildRolePromptEnvelope(args: {
    role: FigmaRole;
    userPrompt: string;
    brief?: PreparedDesignBrief;
    extra?: string;
}): string
{
    const parts = [
        `## ROLE`,
        roleHeader(args.role),
        "",
        "## USER PROMPT",
        args.userPrompt.trim(),
    ];

    if (args.brief)
    {
        parts.push(
            "",
            "## BRIEF",
            [
                `- rewrittenPrompt: ${args.brief.rewrittenPrompt}`,
                `- goal: ${args.brief.goal}`,
                `- platform: ${args.brief.platform}`,
                `- visualDirection: ${args.brief.visualDirection}`,
                `- layoutStrategy: ${args.brief.layoutStrategy}`,
                `- contentStrategy: ${args.brief.contentStrategy}`,
                `- editStrategy: ${args.brief.editStrategy}`,
                ...(args.brief.mustHave.length > 0 ? [`- mustHave: ${args.brief.mustHave.join(" | ")}`] : []),
                ...(args.brief.avoid.length > 0 ? [`- avoid: ${args.brief.avoid.join(" | ")}`] : []),
                ...(args.brief.successCriteria.length > 0 ? [`- successCriteria: ${args.brief.successCriteria.join(" | ")}`] : []),
            ].join("\n"),
        );
    }

    if (args.extra?.trim())
        parts.push("", "## EXTRA", args.extra.trim());

    return parts.join("\n");
}
