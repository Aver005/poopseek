import path from "node:path";
import type { ChatImage, ImageAnalysis } from "@/figma/domain/image-analysis";
import type { ILLMProvider } from "@/providers/types";

const WORKSPACE_ROOT = process.cwd();

async function readAnalystPrompt(): Promise<string>
{
    const file = Bun.file(path.join(WORKSPACE_ROOT, "assets", "prompts", "figma", "image-analyst.prompt.md"));
    return file.text();
}

async function collectStream(gen: AsyncIterable<string>): Promise<string>
{
    let result = "";
    for await (const chunk of gen) result += chunk;
    return result;
}

function parseAnalysis(raw: string): ImageAnalysis
{
    const text = raw.trim();
    const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    const json = fenceMatch ? fenceMatch[1]!.trim() : text;

    const parsed = JSON.parse(json) as Partial<ImageAnalysis>;
    return {
        semanticDescription: parsed.semanticDescription ?? "",
        designStyle: parsed.designStyle ?? "",
        colorPalette: parsed.colorPalette ?? [],
        typography: parsed.typography ?? [],
        components: parsed.components ?? [],
        layout: parsed.layout ?? "",
        referenceIntent: parsed.referenceIntent ?? "reference",
        suggestedActions: parsed.suggestedActions ?? [],
    };
}

export function formatAnalysisForPrompt(analysis: ImageAnalysis): string
{
    const palette = analysis.colorPalette.map((c) => `  ${c.name}: ${c.hex}`).join("\n");
    const typography = analysis.typography.map((t) => `  ${t.role}: ${t.description}`).join("\n");
    const components = analysis.components.map((c) => `  - ${c}`).join("\n");
    const actions = analysis.suggestedActions.map((a) => `  - ${a}`).join("\n");

    return [
        "## Vision Analysis",
        `**Description:** ${analysis.semanticDescription}`,
        `**Style:** ${analysis.designStyle}`,
        `**Layout:** ${analysis.layout}`,
        `**Intent:** ${analysis.referenceIntent}`,
        "**Color palette:**",
        palette,
        "**Typography:**",
        typography,
        "**Components:**",
        components,
        "**Suggested actions:**",
        actions,
    ].join("\n");
}

export async function analyzeImages(
    images: ChatImage[],
    userHint: string,
    provider: ILLMProvider,
): Promise<ImageAnalysis>
{
    if (!provider.withImages)
        throw new Error(`Provider "${provider.info.id}" does not support image analysis`);

    const visionProvider = await provider.withImages(images);
    const systemPrompt = await readAnalystPrompt();
    const userText = userHint.trim()
        ? `The user's request: "${userHint}"\n\nAnalyze the image(s) in relation to this request.`
        : "Analyze the image(s).";

    const raw = await collectStream(
        visionProvider.complete([{ role: "user", content: userText }], systemPrompt),
    );
    return parseAnalysis(raw);
}
