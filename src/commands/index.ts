import { writeLine } from "./io";
import type { Command, CommandsContext } from "./types";

import { createClearCommand } from "./defs/clear";
import { createExitCommand } from "./defs/exit";
import { createHelpCommand } from "./defs/help";
import { createHistoryCommand } from "./defs/history";
import { createModelCommand } from "./defs/model";
import { createQuitCommand } from "./defs/quit";
import { createSessionCommand } from "./defs/session";
import { createStatsCommand } from "./defs/stats";
import { createSwitchCommand } from "./defs/switch";
import { createThemeCommand } from "./defs/theme";
import { createToolsCommand } from "./defs/tools";

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
    registerCommand(createModelCommand(context));

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
