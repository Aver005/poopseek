import { writeLine } from "../io";
import type { Command, CommandsContext } from "../types";

export function createBtwCommand(context: CommandsContext): Command
{
    return {
        name: "/btw",
        description: "Быстрый вопрос вне основного контекста — не влияет на историю диалога",
        execute: async (args) =>
        {
            const question = args.join(" ").trim();
            if (!question)
            {
                writeLine("");
                writeLine("Использование: /btw <вопрос>");
                writeLine("");
                return true;
            }

            if (!context.runSidechat)
            {
                writeLine("");
                writeLine("btw недоступен");
                writeLine("");
                return true;
            }

            await context.runSidechat(question);
            return true;
        },
    };
}
