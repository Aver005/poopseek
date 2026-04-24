import { write, writeLine } from "./io";
import type { Command } from "./types";

export function createHelpCommand(getCommands: () => Map<string, Command>): Command
{
    return {
        name: "/help",
        description: "Показать список доступных команд",
        execute: async () =>
        {
            writeLine("");
            writeLine("Доступные команды:");
            for (const command of getCommands().values())
            {
                write(`  ${command.name} - ${command.description}\n`);
            }
            writeLine("");
            return true;
        },
    };
}
