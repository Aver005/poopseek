import fs from "node:fs";
import { toNumberValue, toStringValue } from "../args";
import type { ToolHandler } from "../types";

export const name = "file.read";

interface ReadResult
{
    path: string;
    content: string;
    error?: string;
}

/** Extract a range of lines: offset is 1-based, limit caps line count */
function sliceContent(raw: string, offset: number | undefined, limit: number | undefined): string
{
    if (offset === undefined && limit === undefined) return raw;

    const lines = raw.split("\n");
    const start = Math.max(0, (offset ?? 1) - 1);
    const end = limit !== undefined ? start + limit : undefined;
    return lines.slice(start, end).join("\n");
}

export const handler: ToolHandler = async (args, context) =>
{
    // Support both single path (string) and multiple paths (array)
    const pathsArg = args.paths ?? args.path;

    if (!pathsArg)
    {
        throw new Error("Missing required args.path or args.paths");
    }

    const paths: string[] = Array.isArray(pathsArg)
        ? pathsArg.map((p: unknown) => toStringValue(p)).filter((p): p is string => p !== null && p.length > 0)
        : [toStringValue(pathsArg)].filter((p): p is string => p !== null && p.length > 0);

    if (paths.length === 0)
    {
        throw new Error("Missing required args.path or args.paths");
    }

    const offset = toNumberValue(args.offset) ?? undefined;
    const limit = toNumberValue(args.limit) ?? undefined;

    const results: ReadResult[] = [];
    const errors: string[] = [];

    for (const requestedPath of paths)
    {
        const targetPath = context.resolvePath(requestedPath);
        try
        {
            const raw = await fs.promises.readFile(targetPath, "utf8");
            results.push({ path: requestedPath, content: sliceContent(raw, offset, limit) });
        }
        catch (err)
        {
            const msg = err instanceof Error ? err.message : String(err);
            results.push({ path: requestedPath, content: "", error: msg });
            errors.push(`${requestedPath}: ${msg}`);
        }
    }

    // Single file: return simple format (backward compatible)
    if (paths.length === 1)
    {
        const r = results[0]!;
        if (r.error)
        {
            return { ok: false, output: r.error, error: r.error };
        }
        return {
            ok: true,
            output: r.content,
            data: { path: r.path, content: r.content, offset, limit },
        };
    }

    // Multiple files: return structured output
    const hasErrors = errors.length > 0;
    const output = results
        .map((r) => {
            const header = `=== ${r.path} ===`;
            return r.error ? `${header}\n[ERROR: ${r.error}]` : `${header}\n${r.content}`;
        })
        .join("\n\n");

    return {
        ok: !hasErrors,
        output,
        error: hasErrors ? errors.join("; ") : undefined,
        data: { files: results },
    };
};
