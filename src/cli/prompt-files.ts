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
    figmaRolePrompts: {
        enhancer: string;
        designer: string;
    };
};

function normalizeRelativeAssetPath(inputPath: string): string
{
    return inputPath.replace(/^[./\\]+/, "");
}

function getExecutableDir(): string
{
    // В скомпилированном Bun-приложении на Windows:
    // - process.execPath → виртуальная ФС бандла (B:\~BUN\root\...)
    // - Bun.main → аналогично
    // - process.argv[0] — как запустили: может быть просто "poopseek.exe"
    //
    // Стратегия: собираем кандидатов, возвращаем первый,
    // рядом с которым реально есть подпапка assets или docs.
    const argv0 = process.argv[0];
    const candidateDirs: string[] = [];

    if (path.isAbsolute(argv0))
    {
        candidateDirs.push(path.dirname(argv0));
    }
    else
    {
        // argv[0] — просто имя, резолвим относительно cwd
        candidateDirs.push(path.dirname(path.resolve(process.cwd(), argv0)));
    }

    candidateDirs.push(path.dirname(process.execPath));
    candidateDirs.push(path.resolve(import.meta.dir, "../.."));

    // Возвращаем первую директорию, рядом с которой есть assets или docs
    for (const dir of candidateDirs)
    {
        if (fs.existsSync(path.join(dir, "assets")) || fs.existsSync(path.join(dir, "docs")))
        {
            return dir;
        }
    }

    // Фолбэк: первая из списка (для информативной ошибки)
    return candidateDirs[0];
}

function collectAssetCandidates(relativePath: string): string[]
{
    const sanitizedRelativePath = normalizeRelativeAssetPath(relativePath);
    const runtimeBases = {
        executableDirectory: getExecutableDir(),
        projectRoot: path.resolve(import.meta.dir, "../.."),
        cwd: process.cwd(),
    };

    const basePaths = Object.keys(runtimeBases)
        .map((key) => runtimeBases[key as keyof typeof runtimeBases]);
    const resolvedPaths = basePaths
        .map((basePath) => path.resolve(basePath, sanitizedRelativePath));
    const cwdResolvedPath = path.resolve(process.cwd(), relativePath);

    // executableDirectory должен быть первым — приоритет exe над cwd
    return Array.from(new Set([...resolvedPaths, cwdResolvedPath]));
}

export function resolveExistingAssetPath(relativePath: string): string
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
    const figmaEnhancerPromptPath = resolveExistingAssetPath("assets/prompts/figma/enhancer.prompt.md");
    const figmaDesignerPromptPath = resolveExistingAssetPath("assets/prompts/figma/designer.prompt.md");

    const [
        basePrompt,
        toolsPrompt,
        compactPrompt,
        reviewPrompt,
        refactorPrompt,
        roleCreatorPrompt,
        poetPrompt,
        figmaPrompt,
        figmaEnhancerPrompt,
        figmaDesignerPrompt,
    ] = await Promise.all([
        fs.promises.readFile(basePromptPath, "utf8"),
        fs.promises.readFile(toolsPromptPath, "utf8"),
        fs.promises.readFile(compactPromptPath, "utf8"),
        fs.promises.readFile(reviewPromptPath, "utf8"),
        fs.promises.readFile(refactorPromptPath, "utf8"),
        fs.promises.readFile(roleCreatorPromptPath, "utf8"),
        fs.promises.readFile(poetPromptPath, "utf8"),
        fs.promises.readFile(figmaPromptPath, "utf8"),
        fs.promises.readFile(figmaEnhancerPromptPath, "utf8"),
        fs.promises.readFile(figmaDesignerPromptPath, "utf8"),
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
        figmaRolePrompts: {
            enhancer: figmaEnhancerPrompt,
            designer: figmaDesignerPrompt,
        },
    };
}
