import fs from "node:fs";
import path from "node:path";

export type PromptFiles = {
    basePrompt: string;
    toolsPrompt: string;
    compactPrompt: string;
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
    const toolsPromptPath = resolveExistingAssetPath("docs/tools/tool.base.md");

    const [basePrompt, toolsPrompt, compactPrompt] = await Promise.all([
        fs.promises.readFile(basePromptPath, "utf8"),
        fs.promises.readFile(toolsPromptPath, "utf8"),
        fs.promises.readFile(compactPromptPath, "utf8"),
    ]);

    return {
        basePrompt,
        toolsPrompt,
        compactPrompt,
    };
}
