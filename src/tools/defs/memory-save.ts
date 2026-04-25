import path from "node:path";
import { toStringValue } from "../args";
import type { ToolHandler } from "../types";
import { getProjectMemoriesDir, sanitizeMemoryFileName } from "../utils/memory-path";
import { writeTextFile } from "../utils/write-text-file";

export const name = "memory.save";

export const handler: ToolHandler = async (args, context) =>
{
    const rawName = toStringValue(args.name);
    const data = toStringValue(args.data);

    if (!rawName || data === null)
    {
        throw new Error("Missing required args.name or args.data");
    }

    const fileName = sanitizeMemoryFileName(rawName);
    const memoriesDir = getProjectMemoriesDir(context.workspaceRoot);
    const targetPath = path.join(memoriesDir, fileName);

    await writeTextFile(targetPath, data.endsWith("\n") ? data : `${data}\n`);

    return {
        ok: true,
        output: `Memory saved: ${fileName}`,
        data: { path: targetPath, name: fileName },
    };
};
