import type { SubAgentRunner } from "@/agent/sub-agent";
import type { ChatImage } from "@/providers/types";
import type { VarEntry } from "@/figma/engine/theme/var-store";
import type { ThemeToken, ComponentDefinition } from "@/figma/engine/theme/theme-state";
import { parseDesignMd, type ParsedDesignMd } from "@/figma/engine/theme/design-md-parser";

export interface DesignerOutput
{
    tokens: VarEntry[];        // legacy flat shape (for enhanceCache / runBuilderOneShot)
    themeTokens: ThemeToken[]; // typed tokens for setActiveTheme
    components: ComponentDefinition[];
    prose: string;
    name?: string;
}

const EMPTY: DesignerOutput = { tokens: [], themeTokens: [], components: [], prose: "" };

function extractDesignMdBlock(raw: string): string | null
{
    // Sub-agent JSON shape: { result: "...md..." } or directly the markdown.
    // Try common patterns.
    if (typeof raw !== "string") return null;
    const trimmed = raw.trim();
    if (trimmed.startsWith("---")) return trimmed;

    // Fenced code block ```yaml or ```md
    const fenced = /```(?:md|markdown|yaml)?\s*\n([\s\S]*?)```/.exec(trimmed);
    if (fenced) return fenced[1]!.trim();

    return null;
}

function tokensToVarEntries(parsed: ParsedDesignMd): VarEntry[]
{
    return parsed.tokens
        .filter(t => t.kind === "color" || t.kind === "spacing" || t.kind === "radius")
        .map(t => ({
            name: `${t.kind === "radius" ? "radius" : t.kind}/${t.key}`,
            value: typeof t.value === "string" ? t.value : "",
        }))
        .filter(e => e.value !== "");
}

export async function runDesigner(
    runner: SubAgentRunner,
    enhanced: string,
    promptContent: string,
    maxRetries = 3,
    images?: ChatImage[],
): Promise<DesignerOutput>
{
    for (let attempt = 1; attempt <= maxRetries; attempt++)
    {
        const result = await runner.run({
            instruction: promptContent + "\n\nDesign description:\n" + enhanced,
            images,
        });

        if (!result.ok) continue;

        // SubAgentRunner.extractJson() tries to JSON.parse every fenced code
        // block — for our DESIGN.md output (a ```md fence) it fails and the
        // runner returns { data: null, raw: text }. So the truth lives in
        // `raw` regardless of whether `data` came back. We also fall back
        // to data fields for safety.
        const raw = (result as { raw?: string }).raw;
        const data = (result.data ?? {}) as Record<string, unknown>;
        const candidates = [
            raw,
            typeof data.designMd === "string" ? data.designMd : null,
            typeof data.markdown === "string" ? data.markdown : null,
            typeof data.result === "string" ? data.result : null,
            typeof data.text === "string" ? data.text : null,
        ].filter((s): s is string => typeof s === "string" && s.length > 0);

        for (const cand of candidates)
        {
            const md = extractDesignMdBlock(cand);
            if (!md) continue;

            const parsed = parseDesignMd(md);
            if (parsed.tokens.length === 0 && parsed.components.length === 0) continue;

            return {
                tokens: tokensToVarEntries(parsed),
                themeTokens: parsed.tokens,
                components: parsed.components,
                prose: parsed.prose,
                name: parsed.name,
            };
        }
    }

    return EMPTY;
}
