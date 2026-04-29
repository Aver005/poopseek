import { writeLine } from "../io";
import type { Command, CommandsContext } from "../types";

export function createWebCommand(context: CommandsContext): Command
{
    return {
        name: "/web",
        description: "Переключить нативный веб-поиск провайдера; /web --local — встроенный поиск через инструменты",
        execute: (args) =>
        {
            const isLocal = args.includes("--local");

            if (isLocal)
            {
                if (!context.getLocalSearchEnabled || !context.setLocalSearchEnabled)
                {
                    writeLine("");
                    writeLine("Управление локальным поиском недоступно");
                    writeLine("");
                    return true;
                }
                const next = !context.getLocalSearchEnabled();
                context.setLocalSearchEnabled(next);
                writeLine("");
                writeLine(`Локальный веб-поиск: ${next ? "включён" : "выключен"}`);
                writeLine("");
                return true;
            }

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
                writeLine(`Нативный веб-поиск не поддерживается провайдером ${provider.info.label}`);
                writeLine(`Используйте /web --local для встроенного поиска через инструменты`);
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
