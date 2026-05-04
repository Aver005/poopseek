import fs from "node:fs";
import { toBooleanValue, toNumberValue, toStringValue } from "../args";
import type { ToolHandler } from "../types";
import { writeTextFile } from "../utils/write-text-file";

export const name = "file.edit";

function buildUnifiedDiff(
    oldPath: string,
    newPath: string,
    oldContent: string,
    newContent: string,
): string
{
    const oldLines = oldContent.split("\n");
    const newLines = newContent.split("\n");

    // Simple line-by-line diff for a single hunk
    // Find first differing line
    let start = 0;
    while (start < oldLines.length && start < newLines.length && oldLines[start] === newLines[start])
    {
        start++;
    }

    // Find last differing line
    let oldEnd = oldLines.length - 1;
    let newEnd = newLines.length - 1;
    while (oldEnd >= start && newEnd >= start && oldLines[oldEnd] === newLines[newEnd])
    {
        oldEnd--;
        newEnd--;
    }

    const contextCount = 3;
    const hunkStart = Math.max(0, start - contextCount);
    const oldHunkEnd = Math.min(oldLines.length - 1, oldEnd + contextCount);
    const newHunkEnd = Math.min(newLines.length - 1, newEnd + contextCount);

    let diff = `--- a/${oldPath}\n+++ b/${newPath}\n`;
    diff += `@@ -${start + 1},${oldHunkEnd - hunkStart + 1} +${start + 1},${newHunkEnd - hunkStart + 1} @@\n`;

    for (let i = hunkStart; i <= Math.max(oldHunkEnd, newHunkEnd); i++)
    {
        const oldLine = i <= oldHunkEnd ? oldLines[i] : null;
        const newLine = i <= newHunkEnd ? newLines[i] : null;

        if (oldLine !== null && newLine !== null && oldLine === newLine)
        {
            diff += ` ${oldLine}\n`;
        }
        else
        {
            if (oldLine !== null && i <= oldHunkEnd)
            {
                diff += `-${oldLine}\n`;
            }
            if (newLine !== null && i <= newHunkEnd)
            {
                diff += `+${newLine}\n`;
            }
        }
    }

    return diff;
}

export const handler: ToolHandler = async (args, context) =>
{
    const requestedPath = toStringValue(args.path);
    const dryRun = toBooleanValue(args.dryRun, false);

    if (!requestedPath)
    {
        return {
            ok: false,
            output: 'Missing required arg: "path"',
            error: 'Missing "path"',
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

    const source = raw.replace(/\r\n/g, "\n");
    const lines = source.split("\n");

    // --- Line-based edit: replace lines lineFrom..lineTo with replace ---
    const lineFrom = toNumberValue(args.lineFrom);
    const lineTo = toNumberValue(args.lineTo);
    const lineReplace = toStringValue(args.replace);

    if (lineFrom !== null)
    {
        const from = Math.max(1, lineFrom);
        const to = lineTo !== null ? Math.min(lines.length, lineTo) : from;

        if (from > lines.length)
        {
            return {
                ok: false,
                output: `lineFrom ${from} exceeds file length (${lines.length} lines)`,
                error: "lineFrom out of range",
            };
        }

        const normalizedReplace = (lineReplace ?? "").replace(/\r\n/g, "\n");
        const before = lines.slice(0, from - 1);
        const after = lines.slice(to);
        const replacementLines = normalizedReplace.length > 0 ? normalizedReplace.split("\n") : [];
        const nextContent = [...before, ...replacementLines, ...after].join("\n");

        const diff = buildUnifiedDiff(requestedPath, requestedPath, source, nextContent);

        if (!dryRun)
        {
            await writeTextFile(targetPath, nextContent);
        }

        return {
            ok: true,
            output: dryRun
                ? `[DRY RUN] Would replace lines ${from}-${to} in ${requestedPath}:\n${diff}`
                : `Replaced lines ${from}-${to} in ${requestedPath}`,
            data: { path: targetPath, diff, dryRun },
        };
    }

    // --- Search-based edit (original behaviour) ---
    const search = toStringValue(args.search);
    const replace = toStringValue(args.replace);
    const replaceAll = toBooleanValue(args.all, false);

    if (search === null || replace === null)
    {
        return {
            ok: false,
            output: 'Missing required args: either "lineFrom" + "replace", or "search" + "replace"',
            error: 'Missing required args',
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

    const normalizedSearch = search.replace(/\r\n/g, "\n");
    const normalizedReplace = replace.replace(/\r\n/g, "\n");

    if (!source.includes(normalizedSearch))
    {
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

    const diff = buildUnifiedDiff(requestedPath, requestedPath, source, nextContent);

    if (!dryRun)
    {
        await writeTextFile(targetPath, nextContent);
    }

    const occurrences = source.split(normalizedSearch).length - 1;
    const replaced = replaceAll ? occurrences : 1;

    return {
        ok: true,
        output: dryRun
            ? `[DRY RUN] Would replace ${replaced} of ${occurrences} occurrence(s) in ${requestedPath}:\n${diff}`
            : `Replaced ${replaced} of ${occurrences} occurrence(s) in ${requestedPath}`,
        data: { path: targetPath, diff, dryRun },
    };
};
