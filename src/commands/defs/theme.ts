import { writeLine } from "../io";
import type { Command, CommandsContext } from "../types";

function isThemeValue(value: string): value is "dark" | "light"
{
    return value === "dark" || value === "light";
}

export function createThemeCommand(context: CommandsContext): Command
{
    return {
        name: "/theme",
        description: "Сменить тему цветов (/theme dark|light)",
        execute: async (args) =>
        {
            if (!context.getTheme || !context.setTheme)
            {
                writeLine("");
                writeLine("Смена темы недоступна");
                writeLine("");
                return true;
            }

            const rawValue = args[0]?.toLowerCase();
            if (!rawValue)
            {
                writeLine("");
                writeLine(`Текущая тема: ${context.getTheme()}`);
                writeLine("Использование: /theme dark|light");
                writeLine("");
                return true;
            }

            if (!isThemeValue(rawValue))
            {
                writeLine("");
                writeLine("Неверная тема. Доступно: dark, light");
                writeLine("");
                return true;
            }

            context.setTheme(rawValue);
            writeLine("");
            writeLine(`Тема переключена: ${rawValue}`);
            writeLine("");
            return true;
        },
    };
}
