import fs from "node:fs";
import path from "node:path";
import { toStringValue } from "../args";
import type { ToolHandler } from "../types";
import { getProjectMemoriesDir, sanitizeMemoryFileName } from "../utils/memory-path";

export const name = "memory.read";

async function readAllMemories(memoriesDir: string): Promise<string>
{
    let entries: fs.Dirent[];
    try
    {
        entries = await fs.promises.readdir(memoriesDir, { withFileTypes: true });
    }
    catch (error)
    {
        const nodeError = error as NodeJS.ErrnoException;
        if (nodeError.code === "ENOENT") return "Память пуста — файлов не найдено.";
        throw error;
    }

    const mdFiles = entries
        .filter((e) => e.isFile() && e.name.endsWith(".md"))
        .sort((a, b) => a.name.localeCompare(b.name));

    if (mdFiles.length === 0) return "Память пуста — файлов не найдено.";

    const sections = await Promise.all(
        mdFiles.map(async (entry) =>
        {
            const content = await fs.promises.readFile(
                path.join(memoriesDir, entry.name),
                "utf8",
            );
            return `## ${entry.name}\n\n${content.trim()}`;
        }),
    );

    return sections.join("\n\n---\n\n");
}

export const handler: ToolHandler = async (args, context) =>
{
    const rawName = toStringValue(args.name);
    const memoriesDir = getProjectMemoriesDir(context.workspaceRoot);

    if (!rawName || rawName.trim() === "")
    {
        const output = await readAllMemories(memoriesDir);
        return { ok: true, output };
    }

    const fileName = sanitizeMemoryFileName(rawName);
    const targetPath = path.join(memoriesDir, fileName);

    try
    {
        const content = await fs.promises.readFile(targetPath, "utf8");
        return {
            ok: true,
            output: content,
            data: { path: targetPath, name: fileName },
        };
    }
    catch (error)
    {
        const nodeError = error as NodeJS.ErrnoException;
        if (nodeError.code === "ENOENT")
        {
            return {
                ok: false,
                output: `Файл памяти не найден: ${fileName}`,
                error: `File not found: ${fileName}`,
            };
        }
        throw error;
    }
};
