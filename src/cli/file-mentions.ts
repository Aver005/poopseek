import fs from "node:fs";
import path from "node:path";
import { colors } from "@/cli/colors";

const MAX_FILE_HINTS = 6;
const INLINE_FILE_LINE_LIMIT = 64;

type MentionToken = {
    start: number;
    end: number;
    query: string;
};

type FileSuggestion = {
    absolutePath: string;
    displayPath: string;
    insertPath: string;
    isDirectory: boolean;
};

export type FileCompletionOption = FileSuggestion & {
    detail: string;
    tone: "yellow" | "green" | "blue" | "cyan";
};

export type FileCompletionState = {
    key: string | null;
    query: string;
    options: FileCompletionOption[];
};

export type PreparedFileMentions = {
    content: string;
    attachments: {
        displayPath: string;
        lineCount: number | null;
        mode: "inline" | "path";
    }[];
};

function isBoundaryCharacter(value: string | undefined): boolean
{
    return value === undefined || /\s/.test(value);
}

function toDisplaySeparators(value: string, separator: string): string
{
    return separator === "\\"
        ? value.replace(/\//g, "\\")
        : value.replace(/\\/g, "/");
}

function detectSeparator(query: string, absolute: boolean): string
{
    if (query.includes("\\")) return "\\";
    if (query.includes("/")) return "/";
    if (absolute && process.platform === "win32") return "\\";
    return "/";
}

function looksAbsolutePath(value: string): boolean
{
    if (path.isAbsolute(value)) return true;
    return /^[a-zA-Z]:[\\/]/.test(value);
}

function isInsideWorkspace(candidatePath: string, workspaceRoot: string): boolean
{
    const normalizedRoot = path.resolve(workspaceRoot);
    const normalizedCandidate = path.resolve(candidatePath);
    if (normalizedCandidate === normalizedRoot) return true;
    return normalizedCandidate.startsWith(`${normalizedRoot}${path.sep}`);
}

function findMentionTokenAtCursor(value: string, cursor: number): MentionToken | null
{
    const safeCursor = Math.max(0, Math.min(cursor, value.length));
    let index = safeCursor;

    if (safeCursor > 0 && isBoundaryCharacter(value[safeCursor]))
    {
        index = safeCursor - 1;
    }

    if (index < 0) return null;

    let start = index;
    while (start >= 0 && !isBoundaryCharacter(value[start]))
    {
        start -= 1;
    }

    start += 1;
    if (value[start] !== "@") return null;
    if (!isBoundaryCharacter(value[start - 1])) return null;

    let end = start + 1;
    while (end < value.length && !isBoundaryCharacter(value[end]))
    {
        end += 1;
    }

    if (safeCursor < start + 1 || safeCursor > end) return null;

    return {
        start,
        end,
        query: value.slice(start + 1, end),
    };
}

function extractMentionTokens(value: string): MentionToken[]
{
    const result: MentionToken[] = [];

    for (let index = 0; index < value.length; index += 1)
    {
        if (value[index] !== "@") continue;
        if (!isBoundaryCharacter(value[index - 1])) continue;

        let end = index + 1;
        while (end < value.length && !isBoundaryCharacter(value[end]))
        {
            end += 1;
        }

        result.push({
            start: index,
            end,
            query: value.slice(index + 1, end),
        });

        index = end - 1;
    }

    return result;
}

function splitQuery(query: string, workspaceRoot: string): {
    directoryPath: string;
    partialName: string;
    absolute: boolean;
    separator: string;
} | null
{
    const absolute = looksAbsolutePath(query);
    const separator = detectSeparator(query, absolute);
    const normalizedQuery = process.platform === "win32"
        ? query.replace(/\//g, "\\")
        : query.replace(/\\/g, "/");
    const lastSeparatorIndex = Math.max(normalizedQuery.lastIndexOf("/"), normalizedQuery.lastIndexOf("\\"));

    const directoryPart = lastSeparatorIndex === -1
        ? ""
        : normalizedQuery.slice(0, lastSeparatorIndex + 1);
    const partialName = lastSeparatorIndex === -1
        ? normalizedQuery
        : normalizedQuery.slice(lastSeparatorIndex + 1);

    const directoryPath = absolute
        ? path.resolve(directoryPart || normalizedQuery)
        : path.resolve(workspaceRoot, directoryPart || ".");

    if (!absolute && !isInsideWorkspace(directoryPath, workspaceRoot))
    {
        return null;
    }

    return {
        directoryPath,
        partialName,
        absolute,
        separator,
    };
}

function toInsertPath(absolutePath: string, workspaceRoot: string, absolute: boolean, separator: string): string
{
    const nextPath = absolute
        ? absolutePath
        : path.relative(workspaceRoot, absolutePath);

    return toDisplaySeparators(nextPath, separator);
}

function sortSuggestions(left: FileSuggestion, right: FileSuggestion): number
{
    if (left.isDirectory !== right.isDirectory)
    {
        return left.isDirectory ? -1 : 1;
    }

    return left.displayPath.localeCompare(right.displayPath, undefined, {
        sensitivity: "base",
    });
}

function resolveExactPath(query: string, workspaceRoot: string): FileSuggestion | null
{
    if (query.length === 0) return null;

    const absolute = looksAbsolutePath(query);
    const separator = detectSeparator(query, absolute);
    const targetPath = absolute
        ? path.resolve(query)
        : path.resolve(workspaceRoot, query);

    if (!absolute && !isInsideWorkspace(targetPath, workspaceRoot))
    {
        return null;
    }

    if (!fs.existsSync(targetPath)) return null;

    const stat = fs.statSync(targetPath, { throwIfNoEntry: false });
    if (!stat) return null;

    const isDirectory = stat.isDirectory();
    const insertPath = toInsertPath(targetPath, workspaceRoot, absolute, separator);

    return {
        absolutePath: targetPath,
        displayPath: insertPath,
        insertPath: isDirectory ? `${insertPath}${separator}` : insertPath,
        isDirectory,
    };
}

function getFileSuggestions(query: string, workspaceRoot: string): FileSuggestion[]
{
    const splitResult = splitQuery(query, workspaceRoot);
    if (splitResult === null) return [];

    const { directoryPath, partialName, absolute, separator } = splitResult;
    if (!fs.existsSync(directoryPath)) return [];

    const entries = fs.readdirSync(directoryPath, { withFileTypes: true });
    const partialLower = partialName.toLowerCase();

    return entries
        .filter((entry) => entry.name.toLowerCase().startsWith(partialLower))
        .map((entry) =>
        {
            const absolutePath = path.join(directoryPath, entry.name);
            const insertPath = toInsertPath(absolutePath, workspaceRoot, absolute, separator);
            const isDirectory = entry.isDirectory();

            return {
                absolutePath,
                displayPath: insertPath,
                insertPath: isDirectory ? `${insertPath}${separator}` : insertPath,
                isDirectory,
            };
        })
        .sort(sortSuggestions);
}


function getCodeFenceLanguage(filePath: string): string
{
    const extension = path.extname(filePath).slice(1).toLowerCase();
    if (extension.length === 0) return "text";
    return extension;
}

function getLineCount(content: string): number
{
    if (content.length === 0) return 0;
    return content.split(/\r?\n/).length;
}

function describeExactSelection(query: string, workspaceRoot: string): FileCompletionOption | null
{
    const selection = resolveExactPath(query, workspaceRoot);
    if (selection === null) return null;

    if (selection.isDirectory)
    {
        return {
            ...selection,
            detail: "папка",
            tone: "blue",
        };
    }

    try
    {
        const content = fs.readFileSync(selection.absolutePath, "utf8");
        const lineCount = getLineCount(content);
        const attachmentMode = lineCount <= INLINE_FILE_LINE_LIMIT ? "будет приложен" : "только путь";

        return {
            ...selection,
            detail: `${lineCount} строк, ${attachmentMode}`,
            tone: "green",
        };
    }
    catch
    {
        return {
            ...selection,
            detail: "файл",
            tone: "green",
        };
    }
}

export function getFileCompletionState(
    value: string,
    cursor: number,
    workspaceRoot: string,
): FileCompletionState
{
    const mentionToken = findMentionTokenAtCursor(value, cursor);
    if (mentionToken === null)
    {
        return {
            key: null,
            query: "",
            options: [],
        };
    }

    const exactSelectionOption = describeExactSelection(mentionToken.query, workspaceRoot);
    const exactSelectionPath = resolveExactPath(mentionToken.query, workspaceRoot);
    const suggestions = getFileSuggestions(mentionToken.query, workspaceRoot)
        .filter((suggestion) =>
        {
            if (exactSelectionPath === null) return true;
            return suggestion.absolutePath !== exactSelectionPath.absolutePath;
        })
        .slice(0, MAX_FILE_HINTS)
        .map((suggestion) =>
        {
            return {
                ...suggestion,
                detail: suggestion.isDirectory ? "папка" : "файл",
                tone: suggestion.isDirectory ? "blue" : "cyan",
            } satisfies FileCompletionOption;
        });

    return {
        key: `${mentionToken.start}:${mentionToken.end}:${mentionToken.query}`,
        query: mentionToken.query,
        options: [
            ...(exactSelectionOption === null ? [] : [exactSelectionOption]),
            ...suggestions,
        ],
    };
}

export function getFileHintLines(
    completionState: FileCompletionState,
    selectedIndex: number,
): string[]
{
    if (completionState.options.length === 0) return [];

    return completionState.options.map((option, index) =>
    {
        const marker = index === selectedIndex
            ? colors.magenta(">")
            : " ";
        const tone = colors[option.tone];

        return `${marker} ${tone(option.displayPath)} ${colors.dim("-")} ${colors.dim(option.detail)}`;
    });
}

export function applyFileCompletion(
    value: string,
    cursor: number,
    workspaceRoot: string,
    selectedIndex = 0,
): {
    value: string;
    cursor: number;
    completed: boolean;
}
{
    const completionState = getFileCompletionState(value, cursor, workspaceRoot);
    if (completionState.options.length === 0)
    {
        return { value, cursor, completed: false };
    }

    const mentionToken = findMentionTokenAtCursor(value, cursor);
    if (mentionToken === null) return { value, cursor, completed: false };

    const normalizedIndex = Math.max(0, Math.min(selectedIndex, completionState.options.length - 1));
    const nextPath = completionState.options[normalizedIndex]?.insertPath ?? mentionToken.query;

    const nextValue = [
        value.slice(0, mentionToken.start + 1),
        nextPath,
        value.slice(mentionToken.end),
    ].join("");

    return {
        value: nextValue,
        cursor: mentionToken.start + 1 + nextPath.length,
        completed: true,
    };
}

export function formatInputLineWithMentions(line: string, workspaceRoot: string): string
{
    return line.replace(/(^|\s)(@\S+)/g, (_match, prefix: string, token: string) =>
    {
        const selection = resolveExactPath(token.slice(1), workspaceRoot);
        if (selection === null) return `${prefix}${colors.yellow(token)}`;
        if (selection.isDirectory) return `${prefix}${colors.blue(token)}`;
        return `${prefix}${colors.green(token)}`;
    });
}

export async function prepareInputWithFileMentions(
    inputValue: string,
    workspaceRoot: string,
): Promise<PreparedFileMentions>
{
    const mentionTokens = extractMentionTokens(inputValue);
    if (mentionTokens.length === 0)
    {
        return {
            content: inputValue,
            attachments: [],
        };
    }

    const seenPaths = new Set<string>();
    const attachments: PreparedFileMentions["attachments"] = [];
    const blocks: string[] = [];

    for (const mentionToken of mentionTokens)
    {
        const selection = resolveExactPath(mentionToken.query, workspaceRoot);
        if (selection === null || selection.isDirectory) continue;
        if (seenPaths.has(selection.absolutePath)) continue;
        seenPaths.add(selection.absolutePath);

        try
        {
            const content = await fs.promises.readFile(selection.absolutePath, "utf8");
            const lineCount = getLineCount(content);
            const mode = lineCount <= INLINE_FILE_LINE_LIMIT ? "inline" : "path";

            attachments.push({
                displayPath: selection.displayPath,
                lineCount,
                mode,
            });

            if (mode === "path")
            {
                blocks.push([
                    `## ${selection.displayPath}`,
                    `path: ${selection.displayPath}`,
                    `line_count: ${lineCount}`,
                    "mode: path-only",
                ].join("\n"));
                continue;
            }

            blocks.push([
                `## ${selection.displayPath}`,
                `path: ${selection.displayPath}`,
                `line_count: ${lineCount}`,
                `mode: inline`,
                `\`\`\`${getCodeFenceLanguage(selection.displayPath)}`,
                content,
                "```",
            ].join("\n"));
        }
        catch
        {
            attachments.push({
                displayPath: selection.displayPath,
                lineCount: null,
                mode: "path",
            });

            blocks.push([
                `## ${selection.displayPath}`,
                `path: ${selection.displayPath}`,
                "mode: path-only",
            ].join("\n"));
        }
    }

    if (blocks.length === 0)
    {
        return {
            content: inputValue,
            attachments,
        };
    }

    return {
        content: [
            inputValue,
            "",
            "# FILE ATTACHMENTS",
            "",
            ...blocks,
        ].join("\n"),
        attachments,
    };
}

export function getFileAttachmentPreviewLines(
    attachments: PreparedFileMentions["attachments"],
): string[]
{
    if (attachments.length === 0) return [];

    return [
        colors.dim("Файлы из @:"),
        ...attachments.map((attachment) =>
        {
            const modeLabel = attachment.mode === "inline"
                ? colors.green("inline")
                : colors.yellow("path");
            const lineCountLabel = attachment.lineCount === null
                ? colors.dim("строки: n/a")
                : colors.dim(`строки: ${attachment.lineCount}`);

            return `${colors.cyan(attachment.displayPath)} ${colors.dim("-")} ${modeLabel} ${colors.dim("|")} ${lineCountLabel}`;
        }),
    ];
}
