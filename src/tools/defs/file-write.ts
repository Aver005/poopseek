import fs from "node:fs";
import path from "node:path";
import { toStringValue } from "./args";
import type { ToolHandler } from "./types";

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
    await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.promises.writeFile(targetPath, content, "utf8");

    return {
        ok: true,
        output: "File written",
        data: { path: targetPath },
    };
};
