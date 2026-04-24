import fs from "node:fs";
import path from "node:path";
import { toStringValue } from "../args";
import type { ToolHandler } from "../types";
import { writeTextFile } from "../utils/write-text-file";

export const name = "file.write";

export const handler: ToolHandler = async (args, context) =>
{
    const requestedPath = toStringValue(args.path);
    const content = toStringValue(args.content);
    if (!requestedPath || content === null)
    {
        throw new Error("Missing required args.path or args.content");
    }

    const targetPath = context.resolvePath(requestedPath);
    await writeTextFile(targetPath, content);

    return {
        ok: true,
        output: "File written",
        data: { path: targetPath },
    };
};
