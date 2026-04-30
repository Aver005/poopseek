import fs from "node:fs";
import path from "node:path";

export type PromptFiles = {
    basePrompt: string;
    toolsPrompt: string;
    compactPrompt: string;
    reviewPrompt: string;
    refactorPrompt: string;
    roleCreatorPrompt: string;
    poetPrompt: string;
    figmaPrompt: string;
};

function normalizeRelativeAssetPath(inputPath: string): string
{
    return inputPath.replace(/^[./\\]+/, "");
}

function collectAssetCandidates(relativePath: string): string[]
{
    const sanitizedRelativePath = normalizeRelativeAssetPath(relativePath);
    const runtimeBases = {
        executableDirectory: path.dirname(process.execPath),
        projectRoot: path.resolve(import.meta.dir, "../.."),
        cwd: process.cwd(),
    };

    const basePaths = Object.keys(runtimeBases)
        .map((key) => runtimeBases[key as keyof typeof runtimeBases]);
    const resolvedPaths = basePaths
        .map((basePath) => path.resolve(basePath, sanitizedRelativePath));
    const cwdResolvedPath = path.resolve(process.cwd(), relativePath);

    return Array.from(new Set([cwdResolvedPath, ...resolvedPaths]));
}

function resolveExistingAssetPath(relativePath: string): string
{
    const candidates = collectAssetCandidates(relativePath);
    for (const candidatePath of candidates)
    {
        if (fs.existsSync(candidatePath))
        {
            return candidatePath;
        }
    }

    throw new Error(
        `Asset not found for "${relativePath}". Checked: ${candidates.join(", ")}`,
    );
}

export async function readPromptFiles(): Promise<PromptFiles>
{
    const basePromptPath = resolveExistingAssetPath("assets/prompts/base.prompt.md");
    const compactPromptPath = resolveExistingAssetPath("assets/prompts/compact.prompt.md");
    const reviewPromptPath = resolveExistingAssetPath("assets/prompts/review.prompt.md");
    const refactorPromptPath = resolveExistingAssetPath("assets/prompts/refactor.prompt.md");
    const toolsPromptPath = resolveExistingAssetPath("docs/tools/tool.base.md");
    const roleCreatorPromptPath = resolveExistingAssetPath("assets/prompts/role-creator.prompt.md");
    const poetPromptPath = resolveExistingAssetPath("assets/prompts/poet.prompt.md");
    const figmaPromptPath = resolveExistingAssetPath("assets/prompts/figma.prompt.md");

    const [basePrompt, toolsPrompt, compactPrompt, reviewPrompt, refactorPrompt, roleCreatorPrompt, poetPrompt, figmaPrompt] = await Promise.all([
        fs.promises.readFile(basePromptPath, "utf8"),
        fs.promises.readFile(toolsPromptPath, "utf8"),
        fs.promises.readFile(compactPromptPath, "utf8"),
        fs.promises.readFile(reviewPromptPath, "utf8"),
        fs.promises.readFile(refactorPromptPath, "utf8"),
        fs.promises.readFile(roleCreatorPromptPath, "utf8"),
        fs.promises.readFile(poetPromptPath, "utf8"),
        fs.promises.readFile(figmaPromptPath, "utf8"),
    ]);

    return {
        basePrompt,
        toolsPrompt,
        compactPrompt,
        reviewPrompt,
        refactorPrompt,
        roleCreatorPrompt,
        poetPrompt,
        figmaPrompt,
    };
}
