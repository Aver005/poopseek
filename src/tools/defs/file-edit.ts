import fs from "node:fs";
import { toBooleanValue, toStringValue } from "../args";
import type { ToolHandler } from "../types";
import { writeTextFile } from "../utils/write-text-file";

export const name = "file.edit";

export const handler: ToolHandler = async (args, context) =>
{
    const requestedPath = toStringValue(args.path);
    const search = toStringValue(args.search);
    const replace = toStringValue(args.replace);
    const replaceAll = toBooleanValue(args.all, false);

    if (!requestedPath || search === null || replace === null)
    {
        return {
            ok: false,
            output: 'Missing required args: "path", "search", "replace"',
            error: 'Missing required args: "path", "search", "replace"',
        };
    }

    if (search.length === 0)
    {
        return {
            ok: false,
            output: '"search" must not be empty — use file.write to overwrite the whole file',
            error: '"search" is empty',
        };
    }

    const targetPath = context.resolvePath(requestedPath);

    let raw: string;
    try
    {
        raw = await fs.promises.readFile(targetPath, "utf8");
    }
    catch (err)
    {
        const msg = err instanceof Error ? err.message : String(err);
        return { ok: false, output: `Cannot read file: ${msg}`, error: msg };
    }

    // Normalise line endings so \n in search/replace always matches
    const source = raw.replace(/\r\n/g, "\n");
    const normalizedSearch = search.replace(/\r\n/g, "\n");
    const normalizedReplace = replace.replace(/\r\n/g, "\n");

    if (!source.includes(normalizedSearch))
    {
        // Try to give a useful hint
        const firstLine = normalizedSearch.split("\n")[0] ?? "";
        const hint = firstLine.length > 0 && source.includes(firstLine)
            ? ' (first line found but full block not matched — check whitespace/indentation)'
            : ' (text not found anywhere in file)';
        return {
            ok: false,
            output: `Search text not found${hint}`,
            error: "Search text not found",
        };
    }

    const nextContent = replaceAll
        ? source.split(normalizedSearch).join(normalizedReplace)
        : source.replace(normalizedSearch, normalizedReplace);

    await writeTextFile(targetPath, nextContent);

    const occurrences = source.split(normalizedSearch).length - 1;
    const replaced = replaceAll ? occurrences : 1;

    return {
        ok: true,
        output: `Replaced ${replaced} of ${occurrences} occurrence(s) in ${requestedPath}`,
        data: { path: targetPath },
    };
};
