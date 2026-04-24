import { writeLine } from "./io";
import type { Command, CommandsContext } from "./types";

type ModelType = "default" | "expert";

function isModelType(value: string): value is ModelType
{
    return value === "default" || value === "expert";
}

export function createSwitchCommand(context: CommandsContext): Command
{
    return {
        name: "/switch",
        description: "Переключить модель (/switch default|expert)",
        execute: async (args) =>
        {
            if (!context.getModelType || !context.setModelType)
            {
                writeLine("");
                writeLine("Переключение модели недоступно");
                writeLine("");
                return true;
            }

            const rawValue = args[0]?.toLowerCase();
            if (!rawValue)
            {
                writeLine("");
                writeLine(`Текущая модель: ${context.getModelType()}`);
                writeLine("Использование: /switch default|expert");
                writeLine("");
                return true;
            }

            if (!isModelType(rawValue))
            {
                writeLine("");
                writeLine("Неверная модель. Доступно: default, expert");
                writeLine("");
                return true;
            }

            context.setModelType(rawValue);
            writeLine("");
            writeLine(`Модель переключена: ${rawValue}`);
            writeLine("");
            return true;
        },
    };
}
