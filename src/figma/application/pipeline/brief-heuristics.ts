/**
 * "Is the user's message already a detailed brief?" — single source of truth.
 *
 * Tune `BRIEF_HEURISTICS` below. Each signal contributes points (capped),
 * total >= threshold AND message.length >= minChars → skip the enhancer
 * and feed the user's text into the pipeline verbatim.
 */

export const BRIEF_HEURISTICS = {
    enabled: true,
    debug: false,

    threshold: 100,
    minChars: 250,

    weights: {
        chars:            { per: 100, points: 8, max: 32 },
        words:            { per: 50,  points: 8, max: 32 },
        lines:            { per: 1,   points: 2, max: 20 },

        markdownHeading:  { points: 20, max: 80 },
        bulletPoint:      { points: 3,  max: 24 },
        codeBlock:        { points: 8,  max: 16 },
        inlineCode:       { points: 1,  max: 6  },

        schemaSection:    { points: 25, max: 100 },
        hexColor:         { points: 6,  max: 24 },
        pixelValue:       { points: 4,  max: 20 },
        quantitySpec:     { points: 5,  max: 25 },
        brandReference:   { points: 10, max: 30 },
    },

    schemaSections: {
        create: [
            "project", "audience", "positioning", "mood", "visual direction",
            "layout structure", "content density", "key reusable", "tone of voice",
            "проект", "аудитория", "позиционирование", "настроение",
            "структура макета", "плотность", "элементы", "тон",
        ],
        edit: [
            "target", "change", "before", "constraints", "optional polish",
            "цель", "изменение", "до →", "ограничения", "полировка",
        ],
    },

    brandLikeWords: [
        "stripe", "notion", "linear", "vercel", "figma", "duolingo",
        "nyt", "new york times", "spotify", "airbnb", "apple", "github",
        "shopify", "discord", "slack", "telegram", "youtube", "twitter",
    ],
};

export interface BriefScore
{
    total: number;
    breakdown: Record<string, number>;
    intent: "create" | "edit" | null;
}

export interface BriefDecision
{
    yes: boolean;
    score: BriefScore;
}

function clamp(value: number, max: number): number
{
    return Math.min(value, max);
}

function countMatches(text: string, pattern: RegExp): number
{
    return (text.match(pattern) ?? []).length;
}

function detectBriefIntent(message: string): "create" | "edit" | null
{
    const lower = message.toLowerCase();
    const { create, edit } = BRIEF_HEURISTICS.schemaSections;
    const createHits = create.filter((s) => lower.includes("## " + s)).length;
    const editHits   = edit.filter((s) => lower.includes("## " + s)).length;
    if (createHits >= 2 && createHits > editHits) return "create";
    if (editHits   >= 2 && editHits   > createHits) return "edit";
    return null;
}

export function scoreBrief(message: string): BriefScore
{
    const w = BRIEF_HEURISTICS.weights;
    const lower = message.toLowerCase();
    const breakdown: Record<string, number> = {};

    const charCount = message.length;
    const wordCount = message.match(/\S+/g)?.length ?? 0;
    const lineCount = message.split("\n").length;

    breakdown.chars = clamp(Math.floor(charCount / w.chars.per) * w.chars.points, w.chars.max);
    breakdown.words = clamp(Math.floor(wordCount / w.words.per) * w.words.points, w.words.max);
    breakdown.lines = clamp(lineCount * w.lines.points, w.lines.max);

    breakdown.markdownHeading = clamp(
        countMatches(message, /^#{1,6}\s+\S/gm) * w.markdownHeading.points,
        w.markdownHeading.max,
    );
    breakdown.bulletPoint = clamp(
        countMatches(message, /^\s*([-*+]|\d+\.)\s+\S/gm) * w.bulletPoint.points,
        w.bulletPoint.max,
    );
    breakdown.codeBlock = clamp(
        Math.floor(countMatches(message, /```/g) / 2) * w.codeBlock.points,
        w.codeBlock.max,
    );
    breakdown.inlineCode = clamp(
        countMatches(message, /`[^`\n]+`/g) * w.inlineCode.points,
        w.inlineCode.max,
    );

    const allSchema = [
        ...BRIEF_HEURISTICS.schemaSections.create,
        ...BRIEF_HEURISTICS.schemaSections.edit,
    ];
    const schemaHits = allSchema.filter((s) => lower.includes("## " + s)).length;
    breakdown.schemaSection = clamp(schemaHits * w.schemaSection.points, w.schemaSection.max);

    breakdown.hexColor = clamp(
        countMatches(message, /#[0-9a-fA-F]{3,8}\b/g) * w.hexColor.points,
        w.hexColor.max,
    );
    breakdown.pixelValue = clamp(
        countMatches(message, /\b\d+\s*(px|rem|em)\b/gi) * w.pixelValue.points,
        w.pixelValue.max,
    );
    breakdown.quantitySpec = clamp(
        countMatches(
            message,
            /\b\d+\s+(card|button|item|section|row|column|chip|icon|tab|link|product|tile|block|карточ|кнопк|элемент|секц|строк|колон)\w*\b/gi,
        ) * w.quantitySpec.points,
        w.quantitySpec.max,
    );

    const brandHits = BRIEF_HEURISTICS.brandLikeWords.filter((b) => lower.includes(b)).length;
    breakdown.brandReference = clamp(brandHits * w.brandReference.points, w.brandReference.max);

    const total = Object.values(breakdown).reduce((sum, v) => sum + v, 0);

    return { total, breakdown, intent: detectBriefIntent(message) };
}

export function isStructuredBrief(message: string): BriefDecision
{
    if (!BRIEF_HEURISTICS.enabled)
        return { yes: false, score: { total: 0, breakdown: {}, intent: null } };

    const score = scoreBrief(message);
    const yes = message.length >= BRIEF_HEURISTICS.minChars
        && score.total >= BRIEF_HEURISTICS.threshold;

    if (BRIEF_HEURISTICS.debug)
    {
        console.log(
            `[brief-heuristics] structured=${yes} total=${score.total}/`
            + `${BRIEF_HEURISTICS.threshold} intent=${score.intent ?? "?"}`,
        );
        console.log(`[brief-heuristics] breakdown:`, score.breakdown);
    }

    return { yes, score };
}
