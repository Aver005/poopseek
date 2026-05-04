import type { SubAgentRunner } from "@/agent/sub-agent";

export async function runEnhancer(
    runner: SubAgentRunner,
    message: string,
    promptContent: string,
    maxRetries = 3,
): Promise<string>
{
    for (let attempt = 1; attempt <= maxRetries; attempt++)
    {
        const result = await runner.run({
            instruction: promptContent + "\n\nUser request: " + message,
        });

        if (result.ok && result.data)
        {
            const data = result.data as Record<string, unknown>;
            if (typeof data.enhanced === "string" && data.enhanced.trim().length > 0)
                return data.enhanced as string;
        }
    }

    return message;
}
