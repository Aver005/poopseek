import fs from "node:fs";
import path from "node:path";
import { toBooleanValue, toStringValue } from "./args";
import type { ToolHandler } from "./types";

export const name = "file.list";

export const handler: ToolHandler = async (args, context) =>
{
    const requestedPath = toStringValue(args.path) ?? ".";
    const recursive = toBooleanValue(args.recursive, false);
    const targetPath = context.resolvePath(requestedPath);

    const stat = await fs.promises.stat(targetPath);
    if (!stat.isDirectory())
    {
        throw new Error("file.list target path must be a directory");
    }

    if (!recursive)
    {
        const entries = await fs.promises.readdir(targetPath, {
            withFileTypes: true,
        });
        const items = entries.map((entry) =>
            entry.isDirectory() ? `${entry.name}/` : entry.name,
        );
        return {
            ok: true,
            output: JSON.stringify({ path: targetPath, items }, null, 2),
            data: { path: targetPath, items },
        };
    }

    const items: string[] = [];
    const walk = async (root: string): Promise<void> =>
    {
        const entries = await fs.promises.readdir(root, { withFileTypes: true });
        for (const entry of entries)
        {
            const absolute = path.join(root, entry.name);
            const relative = path.relative(targetPath, absolute);
            if (entry.isDirectory())
            {
                items.push(`${relative}/`);
                await walk(absolute);
                continue;
            }
            items.push(relative);
        }
    };
    await walk(targetPath);

    return {
        ok: true,
        output: JSON.stringify({ path: targetPath, items }, null, 2),
        data: { path: targetPath, items },
    };
};
