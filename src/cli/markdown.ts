import { colors, getColorMode } from "@/cli/colors";

function strong(value: string): string
{
    if (!getColorMode().enabled) return value;
    return `\x1b[1m${value}\x1b[22m`;
}

function normalizeInline(text: string): string
{
    let value = text;
    value = value.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_full, labelRaw, urlRaw) =>
    {
        const label = String(labelRaw);
        const url = String(urlRaw);
        return `${label} ${colors.dim(`(${url})`)}`;
    });
    value = value.replace(/`([^`\n]+)`/g, (_full, codeRaw) => colors.cyan(String(codeRaw)));
    value = value.replace(/\*\*([^*\n]+)\*\*/g, (_full, strongRaw) => strong(String(strongRaw)));
    return value;
}

export function renderMarkdown(input: string): string
{
    if (input.length === 0) return input;

    const lines = input.split("\n");
    const output: string[] = [];
    let inCodeBlock = false;

    for (const line of lines)
    {
        const fenced = line.match(/^```([a-zA-Z0-9_-]+)?\s*$/);
        if (fenced)
        {
            inCodeBlock = !inCodeBlock;
            continue;
        }

        if (inCodeBlock)
        {
            output.push(colors.cyan(line));
            continue;
        }

        const heading = line.match(/^(#{1,6})\s+(.+)$/);
        if (heading)
        {
            const title = heading[2] ?? "";
            output.push(strong(colors.green(normalizeInline(title))));
            continue;
        }

        const quote = line.match(/^>\s?(.*)$/);
        if (quote)
        {
            output.push(`${colors.dim("│")} ${normalizeInline(quote[1] ?? "")}`);
            continue;
        }

        const unordered = line.match(/^\s*[-*]\s+(.+)$/);
        if (unordered)
        {
            output.push(`• ${normalizeInline(unordered[1] ?? "")}`);
            continue;
        }

        const ordered = line.match(/^\s*(\d+)\.\s+(.+)$/);
        if (ordered)
        {
            output.push(`${ordered[1]}. ${normalizeInline(ordered[2] ?? "")}`);
            continue;
        }

        output.push(normalizeInline(line));
    }

    return output.join("\n");
}
