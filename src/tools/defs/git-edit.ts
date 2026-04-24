import fs from "node:fs";
import { toStringValue } from "../args";
import type { ToolHandler } from "../types";

export const name = "git.edit";

interface DiffHunk
{
    oldStart: number;
    oldCount: number;
    newStart: number;
    newCount: number;
    lines: string[];
}

interface DiffFile
{
    oldPath: string;
    newPath: string;
    hunks: DiffHunk[];
}

function parsePatch(patch: string): DiffFile[]
{
    const files: DiffFile[] = [];
    const rawLines = patch.split("\n");

    let currentFile: DiffFile | null = null;
    let currentHunk: DiffHunk | null = null;

    for (let i = 0; i < rawLines.length; i++)
    {
        const line = rawLines[i] ?? "";

        if (line.startsWith("--- "))
        {
            if (currentFile)
            {
                if (currentHunk) currentFile.hunks.push(currentHunk);
                files.push(currentFile);
                currentHunk = null;
            }

            const nextLine = rawLines[i + 1] ?? "";
            if (!nextLine.startsWith("+++ ")) continue;

            const oldPath = line.slice(4).replace(/^[ab]\//, "");
            const newPath = nextLine.slice(4).replace(/^[ab]\//, "");
            currentFile = { oldPath, newPath, hunks: [] };
            i++;
        }
        else if (line.startsWith("@@ ") && currentFile)
        {
            if (currentHunk) currentFile.hunks.push(currentHunk);

            const match = line.match(/@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
            if (!match) continue;

            currentHunk = {
                oldStart: parseInt(match[1] ?? "1", 10),
                oldCount: match[2] !== undefined ? parseInt(match[2], 10) : 1,
                newStart: parseInt(match[3] ?? "1", 10),
                newCount: match[4] !== undefined ? parseInt(match[4], 10) : 1,
                lines: [],
            };
        }
        else if (currentHunk && (line.startsWith("+") || line.startsWith("-") || line.startsWith(" ")))
        {
            if (line !== "\\ No newline at end of file")
            {
                currentHunk.lines.push(line);
            }
        }
    }

    if (currentFile)
    {
        if (currentHunk) currentFile.hunks.push(currentHunk);
        files.push(currentFile);
    }

    return files;
}

function applyHunks(originalContent: string, hunks: DiffHunk[]): { content: string; error?: string }
{
    const trailingNewline = originalContent.endsWith("\n");
    const lines = trailingNewline
        ? originalContent.slice(0, -1).split("\n")
        : originalContent.split("\n");

    const result: string[] = [];
    let oldIndex = 0;

    for (const hunk of hunks)
    {
        const hunkStart = hunk.oldStart - 1;

        if (hunkStart < oldIndex)
        {
            return { content: "", error: `Hunk @@ -${hunk.oldStart} overlaps already-applied region` };
        }

        while (oldIndex < hunkStart)
        {
            result.push(lines[oldIndex] ?? "");
            oldIndex++;
        }

        for (const hunkLine of hunk.lines)
        {
            const prefix = hunkLine[0];
            const content = hunkLine.slice(1);

            if (prefix === " ")
            {
                const actual = lines[oldIndex] ?? "";
                if (actual !== content)
                {
                    return {
                        content: "",
                        error: `Context mismatch at line ${oldIndex + 1}: expected "${content}", got "${actual}"`,
                    };
                }
                result.push(actual);
                oldIndex++;
            }
            else if (prefix === "-")
            {
                const actual = lines[oldIndex] ?? "";
                if (actual !== content)
                {
                    return {
                        content: "",
                        error: `Remove mismatch at line ${oldIndex + 1}: expected "${content}", got "${actual}"`,
                    };
                }
                oldIndex++;
            }
            else if (prefix === "+")
            {
                result.push(content);
            }
        }
    }

    while (oldIndex < lines.length)
    {
        result.push(lines[oldIndex] ?? "");
        oldIndex++;
    }

    const joined = result.join("\n");
    return { content: trailingNewline ? `${joined}\n` : joined };
}

export const handler: ToolHandler = async (args, context) =>
{
    const patch = toStringValue(args.patch);
    if (!patch)
    {
        throw new Error("Missing required args.patch");
    }

    const diffFiles = parsePatch(patch);
    if (diffFiles.length === 0)
    {
        return { ok: false, output: "No file diffs found in patch", error: "Empty patch" };
    }

    const applied: string[] = [];

    for (const diffFile of diffFiles)
    {
        const targetPath = context.resolvePath(diffFile.newPath);
        const originalContent = await fs.promises.readFile(targetPath, "utf8");

        const { content, error } = applyHunks(originalContent, diffFile.hunks);
        if (error)
        {
            return { ok: false, output: `${diffFile.newPath}: ${error}`, error };
        }

        await fs.promises.writeFile(targetPath, content, "utf8");
        applied.push(diffFile.newPath);
    }

    return {
        ok: true,
        output: `Patch applied to: ${applied.join(", ")}`,
        data: { files: applied },
    };
};
