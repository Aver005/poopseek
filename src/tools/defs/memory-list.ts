import fs from "node:fs";
import type { ToolHandler } from "../types";
import { getProjectMemoriesDir } from "../utils/memory-path";

export const name = "memory.list";

export const handler: ToolHandler = async (_args, context) =>
{
    const memoriesDir = getProjectMemoriesDir(context.workspaceRoot);

    let entries: fs.Dirent[];
    try
    {
        entries = await fs.promises.readdir(memoriesDir, { withFileTypes: true });
    }
    catch (error)
    {
        const nodeError = error as NodeJS.ErrnoException;
        if (nodeError.code === "ENOENT")
        {
            return {
                ok: true,
                output: JSON.stringify({ files: [], memoriesDir }, null, 2),
                data: { files: [], memoriesDir },
            };
        }
        throw error;
    }

    const files = entries
        .filter((e) => e.isFile() && e.name.endsWith(".md"))
        .map((e) => e.name)
        .sort((a, b) => a.localeCompare(b));

    return {
        ok: true,
        output: JSON.stringify({ files, memoriesDir }, null, 2),
        data: { files, memoriesDir },
    };
};
