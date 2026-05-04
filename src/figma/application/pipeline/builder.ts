import type { ILLMProvider } from "@/providers";
import type { VarEntry } from "@/figma/engine/theme/var-store";

export interface BuilderSuccess
{
    ok: true;
    jsx: string;
}

export interface BuilderFailure
{
    ok: false;
    error: string;
}

export type BuilderResult = BuilderSuccess | BuilderFailure;

function extractJsx(text: string): string
{
    const fenced = text.match(/```(?:jsx|tsx)?\s*([\s\S]*?)```/);
    if (fenced) return fenced[1]!.trim();
    return text.trim();
}

function buildPrompt(promptContent: string, enhanced: string, tokens: VarEntry[]): string
{
    const tokenHint = tokens.length > 0
        ? "\n\nDesign tokens:\n" + tokens.map((t) => `- ${t.name}: ${t.value}`).join("\n")
        : "";
    return promptContent + "\n\nUser request:\n" + enhanced + tokenHint;
}

export async function runBuilderOneShot(
    getProvider: () => ILLMProvider,
    promptContent: string,
    enhanced: string,
    tokens: VarEntry[],
    maxRetries = 3,
): Promise<BuilderResult>
{
    const prompt = buildPrompt(promptContent, enhanced, tokens);
    let lastRaw = "";

    for (let attempt = 1; attempt <= maxRetries; attempt++)
    {
        try
        {
            const provider = await getProvider().clone();
            const chunks: string[] = [];
            for await (const chunk of provider.complete([{ role: "user", content: prompt }], ""))
                chunks.push(chunk);

            const raw = chunks.join("");
            lastRaw = raw;
            const jsx = extractJsx(raw);

            if (jsx.includes("<") && jsx.includes(">"))
                return { ok: true, jsx };
        }
        catch (err)
        {
            lastRaw = err instanceof Error ? err.message : String(err);
        }
    }

    return {
        ok: false,
        error: `Builder failed after ${maxRetries} attempts. Last response:\n${lastRaw.slice(0, 400)}`,
    };
}
