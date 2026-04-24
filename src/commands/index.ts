import { createClearCommand } from "./clear";
import { createExitCommand } from "./exit";
import { createHelpCommand } from "./help";
import { createHistoryCommand } from "./history";
import { writeLine } from "./io";
import { createQuitCommand } from "./quit";
import { createSessionCommand } from "./session";
import { createStatsCommand } from "./stats";
import { createSwitchCommand } from "./switch";
import { createThemeCommand } from "./theme";
import { createToolsCommand } from "./tools";
import type { Command, CommandsContext } from "./types";

function getCommandKeyByName(commandName: string): string
{
    return commandName.replace(/^\//, "");
}

export function createCommandHandlers(
    rl: { close: () => void },
    context: CommandsContext = {},
): Map<string, Command>
{
    const commands = new Map<string, Command>();

    const registerCommand = (command: Command): void =>
    {
        commands.set(getCommandKeyByName(command.name), command);
    };

    registerCommand(createHelpCommand(() => commands));
    registerCommand(createExitCommand(rl));
    registerCommand(createQuitCommand(rl));
    registerCommand(createClearCommand());
    registerCommand(createToolsCommand());
    registerCommand(createSessionCommand(context));
    registerCommand(createStatsCommand(context));
    registerCommand(createHistoryCommand(context));
    registerCommand(createThemeCommand(context));
    registerCommand(createSwitchCommand(context));

    return commands;
}

export function getCommandNames(commands: Map<string, Command>): string[]
{
    return Array.from(commands.values(), (command) => command.name).sort((left, right) =>
        left.localeCompare(right),
    );
}

export function createCommandCompleter(
    getCommands: () => Map<string, Command>,
)
{
    return (line: string): [string[], string] =>
    {
        const trimmed = line.trimStart().toLowerCase();
        if (!trimmed.startsWith("/")) return [[], line];
        const slashCommands = getCommandNames(getCommands());
        const hits = slashCommands.filter((name) => name.startsWith(trimmed));
        return [hits.length > 0 ? hits : slashCommands, trimmed];
    };
}

export async function handleCommand(
    input: string,
    commands: Map<string, Command>,
): Promise<boolean>
{
    const trimmed = input.trim().toLowerCase();
    if (!trimmed.startsWith("/")) return true;
    const parts = trimmed.split(/\s+/);
    const cmdName = parts[0];
    if (!cmdName) return true;
    const args = parts.slice(1);
    const command = commands.get(getCommandKeyByName(cmdName));

    if (!command)
    {
        writeLine("");
        writeLine(`Неизвестная команда: ${cmdName}. Введите /help для списка команд.`);
        writeLine("");
        return true;
    }

    return command.execute(args);
}
