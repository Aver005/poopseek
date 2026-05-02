import type { ProviderCallOptions, ILLMProvider } from "@/providers";
import type { ProviderMessage } from "@/providers/types";

export interface PreparedDesignBrief
{
    rewrittenPrompt: string;
    goal: string;
    platform: "mobile" | "tablet" | "desktop";
    visualDirection: string;
    layoutStrategy: string;
    contentStrategy: string;
    mustHave: string[];
    avoid: string[];
    editStrategy: "edit-existing" | "fork-variant" | "new-screen";
    successCriteria: string[];
}

function extractJson(text: string): unknown
{
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenced)
        return JSON.parse(fenced[1]!.trim()) as unknown;

    const trimmed = text.trim();
    if (trimmed.startsWith("{"))
        return JSON.parse(trimmed) as unknown;

    throw new Error("No JSON found in preprocess response");
}

function normalizeArray(value: unknown): string[]
{
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

function normalizePlatform(value: unknown): "mobile" | "tablet" | "desktop"
{
    return value === "desktop" || value === "tablet" ? value : "mobile";
}

export function normalizePreparedBrief(value: unknown, fallbackPrompt: string): PreparedDesignBrief
{
    const record = typeof value === "object" && value !== null ? value as Record<string, unknown> : {};

    return {
        rewrittenPrompt: typeof record.rewrittenPrompt === "string" && record.rewrittenPrompt.trim().length > 0
            ? record.rewrittenPrompt.trim()
            : fallbackPrompt,
        goal: typeof record.goal === "string" && record.goal.trim().length > 0
            ? record.goal.trim()
            : fallbackPrompt,
        platform: normalizePlatform(record.platform),
        visualDirection: typeof record.visualDirection === "string" && record.visualDirection.trim().length > 0
            ? record.visualDirection.trim()
            : "Clean, high-contrast, expressive product UI with clear hierarchy.",
        layoutStrategy: typeof record.layoutStrategy === "string" && record.layoutStrategy.trim().length > 0
            ? record.layoutStrategy.trim()
            : "Use one dominant column, clear content width, strong spacing rhythm and visible section hierarchy.",
        contentStrategy: typeof record.contentStrategy === "string" && record.contentStrategy.trim().length > 0
            ? record.contentStrategy.trim()
            : "Prioritize one strong primary action, concise copy and obvious information grouping.",
        mustHave: normalizeArray(record.mustHave),
        avoid: normalizeArray(record.avoid),
        editStrategy: record.editStrategy === "fork-variant" || record.editStrategy === "new-screen"
            ? record.editStrategy
            : "edit-existing",
        successCriteria: normalizeArray(record.successCriteria),
    };
}

export function formatPreparedBrief(brief: PreparedDesignBrief): string
{
    const lines = [
        `- rewrittenPrompt: ${brief.rewrittenPrompt}`,
        `- goal: ${brief.goal}`,
        `- platform: ${brief.platform}`,
        `- visualDirection: ${brief.visualDirection}`,
        `- layoutStrategy: ${brief.layoutStrategy}`,
        `- contentStrategy: ${brief.contentStrategy}`,
        `- editStrategy: ${brief.editStrategy}`,
    ];

    if (brief.mustHave.length > 0)
        lines.push(`- mustHave: ${brief.mustHave.join(" | ")}`);

    if (brief.avoid.length > 0)
        lines.push(`- avoid: ${brief.avoid.join(" | ")}`);

    if (brief.successCriteria.length > 0)
        lines.push(`- successCriteria: ${brief.successCriteria.join(" | ")}`);

    return lines.join("\n");
}

export function buildPreprocessUserMessage(args: {
    userPrompt: string;
    taskMode: "initial" | "revision";
    snapshotSummary: string;
}): string
{
    return [
        `taskMode: ${args.taskMode}`,
        "",
        "## User prompt",
        args.userPrompt.trim(),
        "",
        "## Current snapshot summary",
        args.snapshotSummary,
    ].join("\n");
}

export async function prepareDesignBrief(args: {
    getProvider: () => ILLMProvider;
    systemPrompt: string;
    userPrompt: string;
    taskMode: "initial" | "revision";
    snapshotSummary: string;
    callOptions?: ProviderCallOptions;
}): Promise<PreparedDesignBrief>
{
    const provider = await args.getProvider().clone();
    const messages: ProviderMessage[] = [{
        role: "user",
        content: buildPreprocessUserMessage({
            userPrompt: args.userPrompt,
            taskMode: args.taskMode,
            snapshotSummary: args.snapshotSummary,
        }),
    }];

    const chunks: string[] = [];
    for await (const chunk of provider.complete(
        messages,
        args.systemPrompt,
        { ...(args.callOptions ?? {}), thinkingEnabled: false, searchEnabled: false },
    ))
    {
        chunks.push(chunk);
    }

    const text = chunks.join("").trim();
    try
    {
        return normalizePreparedBrief(extractJson(text), args.userPrompt);
    }
    catch
    {
        return normalizePreparedBrief(null, args.userPrompt);
    }
}
