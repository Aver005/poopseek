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

export interface PreprocessLayoutContext
{
    platform: "mobile" | "tablet" | "desktop";
    viewportWidth: number;
    viewportHeight: number;
    contentWidthPolicy: "full-bleed" | "inset" | "centered" | "split";
    maxContentWidth: number;
    horizontalPadding: number;
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

function collapseWhitespace(value: string): string
{
    return value.replace(/\s+/g, " ").trim();
}

function normalizeLayoutStrategyForPlatform(value: string, platform: PreparedDesignBrief["platform"]): string
{
    const trimmed = collapseWhitespace(value);
    if (!trimmed) return trimmed;

    if (platform === "mobile")
    {
        const hasDesktopHints = /\b(1200|1280|1366|1440|desktop|web\s+landing|centered content|centered layout)\b/i.test(trimmed);
        if (hasDesktopHints)
        {
            return "Mobile-first single-column layout. Respect viewport width, keep content inset, use strong vertical rhythm, 24px horizontal padding and full-width sections that breathe without desktop-width assumptions.";
        }
    }

    if (platform === "tablet")
    {
        const hasDesktopHints = /\b(1366|1440|desktop|web landing)\b/i.test(trimmed);
        if (hasDesktopHints)
        {
            return "Tablet-first inset layout with strong section rhythm, readable content width, balanced two-column opportunities only where clearly useful.";
        }
    }

    return trimmed;
}

function normalizeContentStrategy(value: string): string
{
    return collapseWhitespace(value);
}

function normalizeVisualDirection(value: string): string
{
    return collapseWhitespace(value);
}

function uniqueNormalizedStrings(values: string[]): string[]
{
    const seen = new Set<string>();
    const result: string[] = [];

    for (const entry of values)
    {
        const normalized = collapseWhitespace(entry);
        if (!normalized) continue;
        const key = normalized.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        result.push(normalized);
    }

    return result;
}

export function alignBriefWithLayout(brief: PreparedDesignBrief, layout?: PreprocessLayoutContext): PreparedDesignBrief
{
    if (!layout) return {
        ...brief,
        visualDirection: normalizeVisualDirection(brief.visualDirection),
        layoutStrategy: normalizeLayoutStrategyForPlatform(brief.layoutStrategy, brief.platform),
        contentStrategy: normalizeContentStrategy(brief.contentStrategy),
        mustHave: uniqueNormalizedStrings(brief.mustHave),
        avoid: uniqueNormalizedStrings(brief.avoid),
        successCriteria: uniqueNormalizedStrings(brief.successCriteria),
    };

    const platform = layout.platform;
    const widthSummary = platform === "mobile"
        ? `Respect mobile viewport ${layout.viewportWidth}x${layout.viewportHeight}, inset content width, max content width ${layout.maxContentWidth}px and horizontal padding ${layout.horizontalPadding}px.`
        : platform === "tablet"
            ? `Respect tablet viewport ${layout.viewportWidth}x${layout.viewportHeight}, inset content width and horizontal padding ${layout.horizontalPadding}px.`
            : `Respect desktop viewport ${layout.viewportWidth}x${layout.viewportHeight}, centered content width up to ${layout.maxContentWidth}px and horizontal padding ${layout.horizontalPadding}px.`;

    const layoutStrategy = normalizeLayoutStrategyForPlatform(brief.layoutStrategy, platform);
    const normalizedAvoid = uniqueNormalizedStrings([
        ...brief.avoid,
        ...(platform === "mobile" ? ["Desktop-width layouts and 1200px+ content assumptions"] : []),
    ]);

    return {
        ...brief,
        platform,
        visualDirection: normalizeVisualDirection(brief.visualDirection),
        layoutStrategy: collapseWhitespace(`${layoutStrategy} ${widthSummary}`),
        contentStrategy: normalizeContentStrategy(brief.contentStrategy),
        mustHave: uniqueNormalizedStrings(brief.mustHave),
        avoid: normalizedAvoid,
        successCriteria: uniqueNormalizedStrings(brief.successCriteria),
    };
}

export function normalizePreparedBrief(
    value: unknown,
    fallbackPrompt: string,
    layout?: PreprocessLayoutContext,
): PreparedDesignBrief
{
    const record = typeof value === "object" && value !== null ? value as Record<string, unknown> : {};

    const normalized: PreparedDesignBrief = {
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

    return alignBriefWithLayout(normalized, layout);
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
    layout: PreprocessLayoutContext;
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
        "",
        "## Target layout constraints",
        `- platform: ${args.layout.platform}`,
        `- viewport: ${args.layout.viewportWidth}x${args.layout.viewportHeight}`,
        `- contentWidthPolicy: ${args.layout.contentWidthPolicy}`,
        `- maxContentWidth: ${args.layout.maxContentWidth}`,
        `- horizontalPadding: ${args.layout.horizontalPadding}`,
        "",
        "## Normalization rules",
        "- If platform is mobile, do not output desktop widths like 1200-1440px.",
        "- Keep the brief aligned with the provided layout constraints.",
        "- Resolve contradictions instead of preserving them.",
    ].join("\n");
}

export async function prepareDesignBrief(args: {
    getProvider: () => ILLMProvider;
    systemPrompt: string;
    userPrompt: string;
    taskMode: "initial" | "revision";
    snapshotSummary: string;
    layout: PreprocessLayoutContext;
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
            layout: args.layout,
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
    return parsePreparedBriefText(text, args.userPrompt, args.layout);
}

export function parsePreparedBriefText(
    text: string,
    fallbackPrompt: string,
    layout?: PreprocessLayoutContext,
): PreparedDesignBrief
{
    try
    {
        return normalizePreparedBrief(extractJson(text), fallbackPrompt, layout);
    }
    catch
    {
        return normalizePreparedBrief(null, fallbackPrompt, layout);
    }
}
