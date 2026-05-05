import type { ILLMProvider } from "@/providers";
import type { VarEntry } from "@/figma/engine/theme/var-store";
import { parseJsx } from "@/figma/engine/jsx/jsx-parser";
import { validateJsxTree, formatJsxValidationErrors } from "@/figma/engine/jsx/jsx-validator";

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

type Message = { role: "user" | "assistant"; content: string };

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
    const userPart = enhanced + tokenHint;
    if (promptContent.includes("{{USER_INPUT}}"))
        return promptContent.replace("{{USER_INPUT}}", userPart);
    return promptContent + "\n\nUser request:\n" + userPart;
}

export async function runBuilderOneShot(
    getProvider: () => ILLMProvider,
    promptContent: string,
    enhanced: string,
    tokens: VarEntry[],
    maxRetries = 3,
): Promise<BuilderResult>
{
    const basePrompt = buildPrompt(promptContent, enhanced, tokens);
    const provider   = await getProvider().clone();

    const messages: Message[] = [{ role: "user", content: basePrompt }];
    let lastError = "";

    for (let attempt = 1; attempt <= maxRetries; attempt++)
    {
        try
        {
            const chunks: string[] = [];
            for await (const chunk of provider.complete(messages, ""))
                chunks.push(chunk);

            const raw = chunks.join("");
            const jsx = extractJsx(raw);

            if (!jsx.includes("<") || !jsx.includes(">"))
            {
                lastError = "No valid JSX found in response";
                if (attempt < maxRetries)
                {
                    messages.push({ role: "assistant", content: raw });
                    messages.push({ role: "user", content: "Response contained no valid JSX. Output only the JSX inside a ```jsx block." });
                }
                continue;
            }

            const nodes  = parseJsx(jsx);
            const errors = validateJsxTree(nodes);

            if (errors.length === 0)
                return { ok: true, jsx };

            lastError = formatJsxValidationErrors(errors);

            if (attempt < maxRetries)
            {
                messages.push({ role: "assistant", content: raw });
                messages.push({
                    role: "user",
                    content: `JSX validation failed. Fix ALL listed issues and resubmit:\n\n${lastError}`,
                });
            }
        }
        catch (err)
        {
            lastError = err instanceof Error ? err.message : String(err);
        }
    }

    return {
        ok: false,
        error: `Builder failed after ${maxRetries} attempts. Last error:\n${lastError.slice(0, 400)}`,
    };
}
