import { writeLine } from "../io";
import type { Command, CommandsContext } from "../types";

export function createSessionsCommand(context: CommandsContext): Command
{
    return {
        name: "/sessions",
        description: "Открыть список локально сохраненных сессий",
        execute: async () =>
        {
            if (!context.openSessions)
            {
                writeLine("");
                writeLine("Список сессий недоступен");
                writeLine("");
                return true;
            }

            writeLine("");
            const result = await context.openSessions();
            if (result.loaded)
            {
                writeLine(`Сессия загружена: ${result.title ?? "без названия"}`);
            }
            else if (result.cancelled)
            {
                writeLine("Выбор сессии отменен");
            }
            else
            {
                writeLine("Сохраненные сессии не найдены");
            }
            writeLine("");
            return true;
        },
    };
}
