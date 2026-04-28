import type { Command, CommandsContext } from "../types";
import { colors } from "@/cli/colors";
import { writeLine } from "../io";

export function createBackCommand(context: CommandsContext): Command
{
    return {
        name: "/back",
        description: "Прервать текущую операцию (создание роли, рефакторинг и т.д.)",
        execute: async () =>
        {
            if (context.cancelActiveOperation?.())
            {
                writeLine("");
                writeLine(colors.yellow("Создание роли прервано."));
                writeLine("");
            }
            else
            {
                writeLine("");
                writeLine(colors.dim("Нет активной операции для прерывания."));
                writeLine("");
            }
            return true;
        },
    };
}
