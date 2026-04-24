import { writeLine } from "./io";
import type { Command, CommandsContext } from "./types";

export function createSessionCommand(context: CommandsContext): Command
{
    return {
        name: "/session",
        description: "Показать информацию о текущей сессии",
        execute: async () =>
        {
            writeLine("");
            writeLine(context.getSessionInfo?.() ?? "Информация о сессии недоступна");
            writeLine("");
            return true;
        },
    };
}
