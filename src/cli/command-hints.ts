import type { Command } from "@/commands/types";
import { colors } from "./colors";

const MAX_HINTS = 6;

export interface HintsRenderer
{
    render: (inputLine: string, commands: Map<string, Command>) => void;
    clear: () => void;
}

export function getCommandHintLines(
    inputLine: string,
    commands: Map<string, Command>,
): string[]
{
    const trimmed = inputLine.trimStart().toLowerCase();
    if (!trimmed.startsWith("/")) return [];

    const candidates = Array.from(commands.values())
        .filter((command) => command.name.startsWith(trimmed))
        .slice(0, MAX_HINTS);
    if (candidates.length === 0) return [];

    return candidates.map((command) =>
        `${colors.cyan(command.name)} ${colors.dim("-")} ${colors.dim(command.description)}`,
    );
}

export function createHintsRenderer(
    writer: { write: (value: string) => void },
): HintsRenderer
{
    let lastSnapshot = "";

    const repaint = (lines: string[]): void =>
    {
        writer.write("\x1b[s");
        writer.write("\n");
        writer.write("\x1b[J");
        if (lines.length > 0)
        {
            writer.write(`${lines.join("\n")}\n`);
        }
        writer.write("\x1b[u");
    };

    return {
        render: (inputLine: string, commands: Map<string, Command>): void =>
        {
            const lines = getCommandHintLines(inputLine, commands);
            const snapshot = lines.join("\n");
            if (snapshot === lastSnapshot) return;
            lastSnapshot = snapshot;
            repaint(lines);
        },
        clear: (): void =>
        {
            if (lastSnapshot.length === 0) return;
            lastSnapshot = "";
            repaint([]);
        },
    };
}
