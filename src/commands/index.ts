import { writeLine } from "./io";
import type { Command, CommandsContext } from "./types";

import { createBtwCommand } from "./defs/btw";
import { createLoadCommand } from "./defs/load";
import { createLogoutCommand, createReloginCommand } from "./defs/logout";
import { createSkillsCommand } from "./defs/skills";
import { createSkillsFolderCommand } from "./defs/skills-folder";
import { createMCPCommand } from "./defs/mcp";
import { createWebCommand } from "./defs/web";
import { createThinkCommand } from "./defs/think";
import { createReviewCommand } from "./defs/review";
import { createRefactorCommand } from "./defs/refactor";
import { createProviderCommand } from "./defs/provider";
import { createClearCommand } from "./defs/clear";
import { createCmptCommand } from "./defs/cmpt";
import { createCompactCommand } from "./defs/compact";
import { createExitCommand } from "./defs/exit";
import { createHelpCommand } from "./defs/help";
import { createHistoryCommand } from "./defs/history";
import { createModelCommand } from "./defs/model";
import { createQuitCommand } from "./defs/quit";
import { createSessionCommand } from "./defs/session";
import { createSessionsCommand } from "./defs/sessions";
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
    registerCommand(createBtwCommand(context));
    registerCommand(createExitCommand(rl));
    registerCommand(createQuitCommand(rl));
    registerCommand(createCompactCommand(context));
    registerCommand(createCmptCommand(context));
    registerCommand(createClearCommand());
    registerCommand(createToolsCommand());
    registerCommand(createSessionCommand(context));
    registerCommand(createSessionsCommand(context));
    registerCommand(createStatsCommand(context));
    registerCommand(createHistoryCommand(context));
    registerCommand(createThemeCommand(context));
    registerCommand(createSwitchCommand(context));
    registerCommand(createModelCommand(context));
    registerCommand(createLoadCommand(context));
    registerCommand(createLogoutCommand(context));
    registerCommand(createReloginCommand(context));
    registerCommand(createSkillsCommand(context));
    registerCommand(createSkillsFolderCommand(context));
    registerCommand(createMCPCommand(context));
    registerCommand(createWebCommand(context));
    registerCommand(createThinkCommand(context));
    registerCommand(createReviewCommand(context));
    registerCommand(createRefactorCommand(context));
    registerCommand(createProviderCommand(context));

    registerCommand({
        name: "/maestro",
        description: "Активировать все навыки (алиас /skills all)",
        execute: () =>
        {
            context.activateAllSkills?.();
            const skills = context.getSkills?.() ?? [];
            writeLine("");
            if (skills.length === 0)
            {
                writeLine("Навыков нет — нечего активировать.");
            }
            else
            {
                writeLine(`Режим Маэстро: все ${skills.length} навыков активированы.`);
            }
            writeLine("");
            return true;
        },
    });

    registerCommand({
        name: "/noob",
        description: "Деактивировать все навыки (алиас /skills reset)",
        execute: () =>
        {
            context.clearSkills?.();
            writeLine("");
            writeLine("Режим Нуба: все навыки деактивированы.");
            writeLine("");
            return true;
        },
    });

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
    const trimmed = input.trim();
    if (!trimmed.toLowerCase().startsWith("/")) return true;
    const spaceIndex = trimmed.search(/\s/);
    const cmdName = (spaceIndex === -1 ? trimmed : trimmed.slice(0, spaceIndex)).toLowerCase();
    if (!cmdName) return true;
    const argsStr = spaceIndex === -1 ? "" : trimmed.slice(spaceIndex + 1).trim();
    const args = argsStr.length > 0 ? argsStr.split(/\s+/) : [];
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
