import fs from "node:fs";
import path from "node:path";
import type { ToolHandler } from "../types";

export const name = "grep";

const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", ".next", "coverage", "__pycache__", ".poopseek"]);
const MAX_FILE_SIZE = 1024 * 1024; // 1 MB – skip larger files
const MAX_RESULTS = 50;

interface GrepMatch
{
    file: string;
    line: number;
    content: string;
    contextBefore: string[];
    contextAfter: string[];
}

function matchesPattern(filename: string, filePattern: string): boolean
{
    if (!filePattern || filePattern === "*")
    {
        return true;
    }

    if (!filePattern.includes("*"))
    {
        return filename.toLowerCase().includes(filePattern.toLowerCase());
    }

    const lower = filename.toLowerCase();
    const parts = filePattern.toLowerCase().split("*");
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

function searchInFile(
    filePath: string,
    searchPattern: string,
    ignoreCase: boolean,
    contextLines: number,
    results: GrepMatch[],
    maxResults: number,
): void
{
    if (results.length >= maxResults) return;

    let stats: fs.Stats;
    try
    {
        stats = fs.statSync(filePath);
    }
    catch
    {
        return;
    }

    if (!stats.isFile() || stats.size > MAX_FILE_SIZE) return;

    let content: string;
    try
    {
        content = fs.readFileSync(filePath, "utf-8");
    }
    catch
    {
        return;
    }

    const lines = content.split("\n");
    const target = ignoreCase ? searchPattern.toLowerCase() : searchPattern;

    for (let i = 0; i < lines.length; i++)
    {
        if (results.length >= maxResults) break;

        const line = lines[i] ?? "";
        const compare = ignoreCase ? line.toLowerCase() : line;

        if (compare.includes(target))
        {
            const before: string[] = [];
            const after: string[] = [];

            if (contextLines > 0)
            {
                for (let b = Math.max(0, i - contextLines); b < i; b++)
                {
                    before.push((lines[b] ?? "").length > 200
                        ? (lines[b] ?? "").slice(0, 200) + "…"
                        : (lines[b] ?? ""));
                }
                for (let a = i + 1; a <= Math.min(lines.length - 1, i + contextLines); a++)
                {
                    after.push((lines[a] ?? "").length > 200
                        ? (lines[a] ?? "").slice(0, 200) + "…"
                        : (lines[a] ?? ""));
                }
            }

            results.push({
                file: filePath,
                line: i + 1,
                content: line.length > 200 ? line.slice(0, 200) + "…" : line,
                contextBefore: before,
                contextAfter: after,
            });
        }
    }
}

function walk(
    dir: string,
    searchPattern: string,
    filePattern: string,
    ignoreCase: boolean,
    contextLines: number,
    results: GrepMatch[],
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
                walk(path.join(dir, entry.name), searchPattern, filePattern, ignoreCase, contextLines, results, maxResults);
            }
        }
        else if (matchesPattern(entry.name, filePattern))
        {
            searchInFile(path.join(dir, entry.name), searchPattern, ignoreCase, contextLines, results, maxResults);
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
            output: 'Missing required argument "pattern" (text to search for)',
            error: 'Missing "pattern"',
        };
    }

    const filePattern = typeof args.glob === "string" && args.glob.trim().length > 0
        ? args.glob.trim()
        : "*";

    const searchRoot = typeof args.path === "string" && args.path.trim().length > 0
        ? context.resolvePath(args.path.trim())
        : context.workspaceRoot;

    const ignoreCase = typeof args.ignoreCase === "boolean"
        ? args.ignoreCase
        : true;

    const contextLines = typeof args.contextLines === "number"
        ? Math.min(Math.max(0, args.contextLines), 10)
        : 0;

    const maxResults = typeof args.limit === "number"
        ? Math.min(Math.max(1, args.limit), 200)
        : MAX_RESULTS;

    const matches: GrepMatch[] = [];
    walk(searchRoot, pattern, filePattern, ignoreCase, contextLines, matches, maxResults);

    if (matches.length === 0)
    {
        return {
            ok: false,
            output: `No matches found for "${pattern}"`,
            error: "No matches",
        };
    }

    const truncated = matches.length >= maxResults;
    const output = matches
        .map((m) => {
            const rel = path.relative(context.workspaceRoot, m.file);
            const parts: string[] = [];
            for (const bl of m.contextBefore)
            {
                parts.push(`${rel}-:  ${bl}`);
            }
            parts.push(`${rel}:${m.line}: ${m.content}`);
            for (const al of m.contextAfter)
            {
                parts.push(`${rel}-:  ${al}`);
            }
            return parts.join("\n");
        })
        .join("\n--\n") + (truncated ? `\n(showing first ${maxResults} results)` : "");

    return {
        ok: true,
        output,
        data: {
            matches: matches.map((m) => ({
                ...m,
                file: path.relative(context.workspaceRoot, m.file),
            })),
            count: matches.length,
            truncated,
        },
    };
};
