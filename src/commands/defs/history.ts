import { writeLine } from "../io";
import type { Command, CommandsContext } from "../types";

export function createHistoryCommand(context: CommandsContext): Command
{
    return {
        name: "/history",
        description: "Очистить историю диалога",
        execute: async () =>
        {
            if (!context.clearHistory)
            {
                writeLine("");
                writeLine("Очистка истории недоступна");
                writeLine("");
                return true;
            }

            context.clearHistory();
            writeLine("");
            writeLine("История диалога очищена");
            writeLine("");
            return true;
        },
    };
}
