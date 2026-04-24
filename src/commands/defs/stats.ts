import { writeLine } from "../io";
import type { Command, CommandsContext } from "../types";

export function createStatsCommand(context: CommandsContext): Command
{
    return {
        name: "/stats",
        description: "Показать статистику контекста",
        execute: async () =>
        {
            writeLine("");
            writeLine(context.getContextStats?.() ?? "Статистика недоступна");
            writeLine("");
            return true;
        },
    };
}
