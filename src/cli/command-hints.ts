import type { Command } from "@/commands/types";
import { colors } from "./colors";

const MAX_HINTS = 6;

export interface HintsRenderer
{
    render: (inputLine: string, commands: Map<string, Command>) => void;
    clear: () => void;
}

function buildHintLines(
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
    const repaint = (lines: string[]): void =>
    {
        writer.write("\x1b7");
        writer.write("\n");
        writer.write("\x1b[0J");
        if (lines.length > 0)
        {
            writer.write(`${colors.dim("Подсказки:")}\n`);
            writer.write(`${lines.join("\n")}\n`);
        }
        writer.write("\x1b8");
    };

    return {
        render: (inputLine: string, commands: Map<string, Command>): void =>
        {
            repaint(buildHintLines(inputLine, commands));
        },
        clear: (): void =>
        {
            repaint([]);
        },
    };
}
