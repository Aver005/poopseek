import type { ILLMProvider, ProviderCallOptions } from "@/providers";
import type { ChatImage } from "@/providers/types";

export type VerdictSeverity = "ok" | "minor" | "major";

export interface VerdictIssue
{
    category: string;
    severity: "minor" | "major";
    target: string;
    observation: string;
    suggested_fix: string;
}

export interface BriefVerdict
{
    severity: VerdictSeverity;
    summary: string;
    issues: VerdictIssue[];
}

function parseVerdict(text: string): BriefVerdict | null
{
    const block = text.match(/```json\s*([\s\S]*?)\s*```/);
    const raw = block?.[1] ?? text;
    let parsed: unknown;
    try { parsed = JSON.parse(raw); }
    catch { return null; }

    if (!parsed || typeof parsed !== "object") return null;
    const o = parsed as Record<string, unknown>;
    const severity = o.severity;
    const summary = o.summary;
    const issues = o.issues;

    if (severity !== "ok" && severity !== "minor" && severity !== "major") return null;
    if (typeof summary !== "string") return null;
    if (!Array.isArray(issues)) return null;

    const cleanIssues: VerdictIssue[] = [];
    for (const item of issues)
    {
        if (!item || typeof item !== "object") continue;
        const it = item as Record<string, unknown>;
        if (it.severity !== "minor" && it.severity !== "major") continue;
        if (typeof it.target !== "string" || !it.target.trim()) continue;
        if (typeof it.observation !== "string") continue;
        cleanIssues.push({
            category: String(it.category ?? "other"),
            severity: it.severity,
            target: it.target.trim(),
            observation: it.observation,
            suggested_fix: typeof it.suggested_fix === "string" ? it.suggested_fix : "",
        });
    }

    return { severity, summary, issues: cleanIssues };
}

/**
 * Run the visual-QA sub-agent. Returns a structured verdict. On parse
 * failure across all retries, returns a benign "ok" verdict — better than
 * blocking the user on a flaky parser.
 */
export async function runCensor(
    getProvider: () => ILLMProvider,
    systemPrompt: string,
    jsx: string,
    userRequest: string,
    image: ChatImage,
    callOptions?: ProviderCallOptions,
    maxRetries = 2,
): Promise<BriefVerdict>
{
    const root = getProvider();
    if (!root.withImages)
    {
        return {
            severity: "ok",
            summary: "censor disabled — active provider does not support images",
            issues: [],
        };
    }
    const provider = await root.withImages([image]);

    const userMessage =
        "## Original user request\n"
        + (userRequest.trim() || "(not provided)")
        + "\n\n## JSX source\n```jsx\n"
        + jsx
        + "\n```";

    for (let attempt = 1; attempt <= maxRetries; attempt++)
    {
        const chunks: string[] = [];
        for await (const chunk of provider.complete(
            [{ role: "user", content: userMessage }],
            systemPrompt,
            callOptions,
        ))
            chunks.push(chunk);

        const verdict = parseVerdict(chunks.join(""));
        if (verdict) return verdict;
    }

    return {
        severity: "ok",
        summary: "censor failed to parse — assuming ok",
        issues: [],
    };
}

/**
 * Convert a verdict into a handyman edit instruction. Handyman is trained
 * on free-form user requests; format the issues as a clear, numbered list
 * with explicit targets + fixes so it doesn't have to interpret.
 */
export function formatVerdictAsEdit(verdict: BriefVerdict): string
{
    const lines: string[] = [
        "Fix the following issues found by visual review of the rendered design.",
        "Apply only the fixes listed; do not redesign or restyle untouched elements.",
        "",
    ];
    verdict.issues.forEach((issue, i) =>
    {
        lines.push(`## Issue ${i + 1}: ${issue.category} (${issue.severity})`);
        lines.push(`Target: ${issue.target}`);
        lines.push(`Problem: ${issue.observation}`);
        if (issue.suggested_fix) lines.push(`Suggested fix: ${issue.suggested_fix}`);
        lines.push("");
    });
    return lines.join("\n");
}
