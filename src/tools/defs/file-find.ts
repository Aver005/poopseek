import fs from "node:fs";
import path from "node:path";
import type { ToolHandler } from "../types";

export const name = "file.find";

const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", ".next", "coverage", "__pycache__"]);

function matchPattern(filename: string, pattern: string): boolean
{
    if (!pattern.includes("*"))
    {
        return filename.toLowerCase().includes(pattern.toLowerCase());
    }

    // Simple glob: split on * and match each part in order
    const lower = filename.toLowerCase();
    const parts = pattern.toLowerCase().split("*");
    let idx = 0;
    for (const part of parts)
    {
        if (part.length === 0) continue;
        const found = lower.indexOf(part, idx);
        if (found === -1) return false;
        idx = found + part.length;
    }
    return true;
}

function search(
    dir: string,
    pattern: string,
    results: string[],
    maxResults: number,
): void
{
    if (results.length >= maxResults) return;

    let entries: fs.Dirent[];
    try
    {
        entries = fs.readdirSync(dir, { withFileTypes: true });
    }
    catch
    {
        return;
    }

    for (const entry of entries)
    {
        if (results.length >= maxResults) break;

        if (entry.isDirectory())
        {
            if (!SKIP_DIRS.has(entry.name))
            {
                search(path.join(dir, entry.name), pattern, results, maxResults);
            }
        }
        else if (matchPattern(entry.name, pattern))
        {
            results.push(path.join(dir, entry.name));
        }
    }
}

export const handler: ToolHandler = async (args, context) =>
{
    const pattern = typeof args.pattern === "string" ? args.pattern.trim() : "";
    if (!pattern)
    {
        return {
            ok: false,
            output: 'Missing required argument "pattern" (filename or glob, e.g. "*.ts", "config")',
            error: 'Missing "pattern"',
        };
    }

    const searchRoot = typeof args.path === "string" && args.path.trim().length > 0
        ? context.resolvePath(args.path.trim())
        : context.workspaceRoot;

    const maxResults = typeof args.limit === "number"
        ? Math.min(Math.max(1, args.limit), 200)
        : 50;

    const absolute: string[] = [];
    search(searchRoot, pattern, absolute, maxResults);

    const relative = absolute.map((p) => path.relative(context.workspaceRoot, p));

    if (relative.length === 0)
    {
        return {
            ok: false,
            output: `No files found matching "${pattern}"`,
            error: "No matches",
        };
    }

    const truncated = absolute.length >= maxResults;
    const output = relative.join("\n") + (truncated ? `\n(showing first ${maxResults} results)` : "");

    return {
        ok: true,
        output,
        data: { files: relative, count: relative.length, truncated },
    };
};
