import fs from "node:fs";
import { toBooleanValue, toStringValue } from "./args";
import type { ToolHandler } from "./types";

export const name = "file.edit";

export const handler: ToolHandler = async (args, context) =>
{
    const requestedPath = toStringValue(args.path);
    const search = toStringValue(args.search);
    const replace = toStringValue(args.replace);
    const replaceAll = toBooleanValue(args.all, false);

    if (!requestedPath || search === null || replace === null)
    {
        throw new Error("Missing required args.path, args.search, or args.replace");
    }

    const targetPath = context.resolvePath(requestedPath);
    const source = await fs.promises.readFile(targetPath, "utf8");
    if (!source.includes(search))
    {
        return {
            ok: false,
            output: "Search pattern not found",
            error: "Search pattern not found",
        };
    }

    const nextContent = replaceAll
        ? source.split(search).join(replace)
        : source.replace(search, replace);
    await fs.promises.writeFile(targetPath, nextContent, "utf8");

    return {
        ok: true,
        output: "File updated",
        data: { path: targetPath },
    };
};
