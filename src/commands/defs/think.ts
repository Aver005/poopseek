import { writeLine } from "../io";
import type { Command, CommandsContext } from "../types";

export function createThinkCommand(context: CommandsContext): Command
{
    return {
        name: "/think",
        description: "Переключить режим рассуждений (thinking_enabled)",
        execute: () =>
        {
            if (!context.getThinkingEnabled || !context.setThinkingEnabled)
            {
                writeLine("");
                writeLine("Управление режимом рассуждений недоступно");
                writeLine("");
                return true;
            }

            const next = !context.getThinkingEnabled();
            context.setThinkingEnabled(next);
            writeLine("");
            writeLine(`Режим рассуждений: ${next ? "включён" : "выключен"}`);
            writeLine("");
            return true;
        },
    };
}
