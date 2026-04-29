import { writeLine } from "../io";
import type { Command, CommandsContext } from "../types";

export function createRateCommand(context: CommandsContext): Command
{
    return {
        name: "/rate",
        description: "Установить задержку между запросами в мс (0 или off — отключить)",
        execute: (args) =>
        {
            if (!context.getRateDelay || !context.setRateDelay)
            {
                writeLine("");
                writeLine("Управление задержкой недоступно");
                writeLine("");
                return true;
            }

            const arg = args[0]?.trim().toLowerCase();
            if (!arg)
            {
                const current = context.getRateDelay();
                writeLine("");
                writeLine(current > 0 ? `Текущая задержка: ${current} мс` : "Задержка отключена");
                writeLine("");
                return true;
            }

            if (arg === "off" || arg === "0")
            {
                context.setRateDelay(0);
                writeLine("");
                writeLine("Задержка отключена");
                writeLine("");
                return true;
            }

            const ms = Number(arg);
            if (!Number.isFinite(ms) || ms < 0)
            {
                writeLine("");
                writeLine("Укажите число в миллисекундах или off");
                writeLine("");
                return true;
            }

            const rounded = Math.round(ms);
            context.setRateDelay(rounded);
            writeLine("");
            writeLine(`Задержка установлена: ${rounded} мс`);
            writeLine("");
            return true;
        },
    };
}
