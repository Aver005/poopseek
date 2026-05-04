import type { SubAgentRunner } from "@/agent/sub-agent";

export async function runEnhancer(runner: SubAgentRunner, message: string, promptContent: string): Promise<string>
{
    const result = await runner.run({
        instruction: promptContent + "\n\nUser request: " + message,
    });

    if (result.ok && result.data && typeof (result.data as Record<string, unknown>).enhanced === "string")
        return (result.data as Record<string, unknown>).enhanced as string;

    return message;
}
