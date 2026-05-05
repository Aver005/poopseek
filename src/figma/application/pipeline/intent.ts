import type { SubAgentRunner } from "@/agent/sub-agent";

export interface IntentResult
{
    intent: "create" | "edit";
    enhanced: string;
}

export async function runIntentClassifier(
    runner: SubAgentRunner,
    message: string,
    currentJsx: string,
    promptContent: string,
    maxRetries = 3,
): Promise<IntentResult>
{
    const hasDesign = currentJsx !== "(empty)" && currentJsx.trim().length > 0;
    const designSnippet = hasDesign
        ? currentJsx.slice(0, 3000) + (currentJsx.length > 3000 ? "\n... (truncated)" : "")
        : "none";

    const instruction = promptContent
        .replace("{{CURRENT_DESIGN}}", designSnippet)
        .replace("{{USER_INPUT}}", message);

    for (let attempt = 1; attempt <= maxRetries; attempt++)
    {
        const result = await runner.run({ instruction });

        if (result.ok && result.data)
        {
            const d = result.data as Record<string, unknown>;
            if ((d.intent === "create" || d.intent === "edit") && typeof d.enhanced === "string" && d.enhanced.trim())
                return { intent: d.intent, enhanced: d.enhanced.trim() };
        }
    }

    return { intent: hasDesign ? "edit" : "create", enhanced: message };
}
