import type { SubAgentRunner } from "@/agent/sub-agent";
import type { VarEntry } from "@/figma/engine/theme/var-store";

export async function runDesigner(
    runner: SubAgentRunner,
    enhanced: string,
    promptContent: string,
    maxRetries = 3,
): Promise<VarEntry[]>
{
    for (let attempt = 1; attempt <= maxRetries; attempt++)
    {
        const result = await runner.run({
            instruction: promptContent + "\n\nDesign description:\n" + enhanced,
        });

        if (!result.ok || !result.data) continue;

        const data = result.data as Record<string, unknown>;
        if (!Array.isArray(data.tokens)) continue;

        const tokens = (data.tokens as Array<Record<string, unknown>>)
            .filter((t) => typeof t.name === "string" && (typeof t.value === "string" || typeof t.value === "number"))
            .map((t) => ({ name: t.name as string, value: t.value as string | number }));

        if (tokens.length > 0) return tokens;
    }

    return [];
}
