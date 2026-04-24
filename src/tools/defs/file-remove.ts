import fs from "node:fs";
import { toStringValue } from "../args";
import type { ToolHandler } from "../types";

export const name = "file.remove";

export const handler: ToolHandler = async (args, context) =>
{
    const requestedPath = toStringValue(args.path);
    if (!requestedPath)
    {
        throw new Error("Missing required args.path");
    }

    const targetPath = context.resolvePath(requestedPath);
    await fs.promises.rm(targetPath, { recursive: true, force: true });

    return {
        ok: true,
        output: "Path removed",
        data: { path: targetPath },
    };
};
