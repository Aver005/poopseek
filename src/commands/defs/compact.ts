import { writeLine } from "../io";
import type { Command, CommandsContext } from "../types";

export function createCompactCommand(context: CommandsContext): Command
{
    return {
        name: "/compact",
        description: "Сжать историю диалога в сводку контекста",
        execute: async () =>
        {
            if (!context.compactContext)
            {
                writeLine("");
                writeLine("Сжатие контекста недоступно");
                writeLine("");
                return true;
            }

            writeLine("");
            writeLine("Сжимаю контекст...");
            let result:
                | {
                    before: number;
                    after: number;
                    summaryChars: number;
                }
                | null = null;
            try
            {
                result = await context.compactContext();
            }
            catch (error)
            {
                const message = error instanceof Error ? error.message : String(error);
                writeLine(`Не удалось сжать контекст: ${message}`);
                writeLine("");
                return true;
            }

            if (!result)
            {
                writeLine("Сжатие пропущено");
                writeLine("");
                return true;
            }

            writeLine(
                `Контекст сжат: ${result.before} -> ${result.after} сообщений, сводка ${result.summaryChars} символов`,
            );
            writeLine("");
            return true;
        },
    };
}
