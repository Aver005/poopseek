import fs from "node:fs";
import { toStringValue } from "../args";
import type { ToolHandler } from "../types";

export const name = "file.read";

export const handler: ToolHandler = async (args, context) =>
{
    const requestedPath = toStringValue(args.path);
    if (!requestedPath)
    {
        throw new Error("Missing required args.path");
    }

    const targetPath = context.resolvePath(requestedPath);
    const content = await fs.promises.readFile(targetPath, "utf8");

    return {
        ok: true,
        output: content,
        data: { path: targetPath, content },
    };
};
