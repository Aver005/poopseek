import type { SubAgentRunner } from "@/agent/sub-agent";
import type { VarEntry } from "@/figma/engine/theme/var-store";

export async function runDesigner(runner: SubAgentRunner, enhanced: string, promptContent: string): Promise<VarEntry[]>
{
    const result = await runner.run({
        instruction: promptContent + "\n\nDesign description:\n" + enhanced,
    });

    if (!result.ok || !result.data) return [];

    const data = result.data as Record<string, unknown>;
    if (!Array.isArray(data.tokens)) return [];

    return (data.tokens as Array<Record<string, unknown>>)
        .filter(t => typeof t.name === "string" && (typeof t.value === "string" || typeof t.value === "number"))
        .map(t => ({ name: t.name as string, value: t.value as string | number }));
}
