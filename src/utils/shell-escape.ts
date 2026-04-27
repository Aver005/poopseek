type Platform = "win32" | "linux" | "darwin";

export function escapeShellArg(
    arg: string,
    platform: Platform = process.platform as Platform,
): string
{
    if (platform === "win32")
    {
        // PowerShell single-quoted literal string: single quotes doubled
        return `'${arg.replace(/'/g, "''")}'`;
    }

    // Bash: single-quoted string with ' -> '\''
    return `'${arg.replace(/'/g, "'\\''")}'`;
}

export function buildSafeCommand(
    parts: string[],
    platform: Platform = process.platform as Platform,
): string
{
    return parts.map((p) => escapeShellArg(p, platform)).join(" ");
}
