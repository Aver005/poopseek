import type { ILLMProvider } from "@/providers";
import type { ChatImage } from "@/providers/types";
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

// Take the LAST fenced jsx block — when the model retries after a
// validation error it sometimes echoes the broken attempt above the
// corrected one. The corrected version is always the last block.
function extractJsx(text: string): string
{
    const fences = [...text.matchAll(/```(?:jsx|tsx)?\s*([\s\S]*?)```/g)];
    if (fences.length > 0) return fences[fences.length - 1]![1]!.trim();
    return text.trim();
}

function buildPrompt(
    promptContent: string,
    enhanced: string,
    tokens: VarEntry[],
    registeredComponents: string[],
): string
{
    const tokenHint = tokens.length > 0
        ? "\n\nDesign tokens:\n" + tokens.map((t) => `- ${t.name}: ${t.value}`).join("\n")
        : "";
    const userPart = enhanced + tokenHint;

    const componentsBlock = registeredComponents.length > 0
        ? "Available Figma Components (use `<Instance of=\"Name\" .../>`):\n"
            + registeredComponents.map((n) => `  - ${n}`).join("\n")
            + "\n\n**Only emit `<Instance of=\"X\">` for X in this list.** For anything else, fall back to inline `<Frame>` (or `<Frame as=\"X\">` for legacy prop-bundle expansion). Do NOT invent component names."
        : "**No Figma Components are registered for this design.** Do NOT use `<Instance of=\"...\">` at all — every UI element must be inline `<Frame>` / `<Text>` / `<Image>` / etc. (Optionally use `<Frame as=\"...\">` if a matching DESIGN.md component bundle exists.)";

    let out = promptContent;
    if (out.includes("{{REGISTERED_COMPONENTS}}"))
        out = out.replace("{{REGISTERED_COMPONENTS}}", componentsBlock);
    else
        out = out + "\n\n---\n\n" + componentsBlock;

    if (out.includes("{{USER_INPUT}}"))
        return out.replace("{{USER_INPUT}}", userPart);
    return out + "\n\nUser request:\n" + userPart;
}

export async function runBuilderOneShot(
    getProvider: () => ILLMProvider,
    promptContent: string,
    enhanced: string,
    tokens: VarEntry[],
    maxRetries = 3,
    images?: ChatImage[],
    registeredComponents: string[] = [],
): Promise<BuilderResult>
{
    const basePrompt = buildPrompt(promptContent, enhanced, tokens, registeredComponents);
    const root = getProvider();
    const provider = images?.length && root.withImages
        ? await root.withImages(images)
        : await root.clone();

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
                    content:
                        `JSX validation failed. Fix ALL listed issues and resubmit.\n\n` +
                        `🚨 RULES FOR YOUR RESPONSE:\n` +
                        `- Output ONE single \`\`\`jsx block containing ONLY the corrected JSX.\n` +
                        `- Do NOT include the previous (broken) version. Replace it entirely.\n` +
                        `- Do NOT add a second root frame "Fixed" or similar — keep exactly ONE root.\n\n` +
                        `Errors to fix:\n${lastError}`,
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
