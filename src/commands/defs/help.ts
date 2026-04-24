import { colors } from "@/cli/colors";
import { write, writeLine } from "../io";
import type { Command } from "../types";

export function createHelpCommand(getCommands: () => Map<string, Command>): Command
{
    return {
        name: "/help",
        description: "Показать список доступных команд",
        execute: async () =>
        {
            writeLine("\n");
            writeLine(colors.yellow("Доступные команды:"));
            for (const command of getCommands().values())
            {
                write(`  ${colors.cyan(command.name)} - ${colors.dim(command.description)}\n`);
            }
            writeLine("");
            return true;
        },
    };
}
