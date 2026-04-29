import { writeLine } from "../io";
import type { Command, CommandsContext } from "../types";

export function createWebCommand(context: CommandsContext): Command
{
    return {
        name: "/web",
        description: "Переключить веб-поиск (search_enabled)",
        execute: () =>
        {
            if (!context.getSearchEnabled || !context.setSearchEnabled)
            {
                writeLine("");
                writeLine("Управление веб-поиском недоступно");
                writeLine("");
                return true;
            }

            const provider = context.getCurrentProvider?.();
            if (provider && !provider.capabilities.webSearch)
            {
                writeLine("");
                writeLine(`Веб-поиск не поддерживается провайдером ${provider.info.label}`);
                writeLine("");
                return true;
            }

            const next = !context.getSearchEnabled();
            context.setSearchEnabled(next);
            writeLine("");
            writeLine(`Веб-поиск: ${next ? "включён" : "выключен"}`);
            writeLine("");
            return true;
        },
    };
}
