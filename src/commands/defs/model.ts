import { writeLine } from "../io";
import type { Command, CommandsContext } from "../types";

export function createModelCommand(context: CommandsContext): Command
{
    return {
        name: "/model",
        description: "Показать или сменить модель текущего провайдера",
        execute: async (args) =>
        {
            if (!context.getModel || !context.setModel || !context.listModels)
            {
                writeLine("");
                writeLine("Управление моделью недоступно");
                writeLine("");
                return true;
            }

            const arg = args[0];

            if (!arg)
            {
                const [models, current] = await Promise.all([context.listModels(), context.getModel()]);
                writeLine("");
                writeLine(`Текущая модель: ${current}`);
                writeLine("");

                if (models.length === 0)
                {
                    writeLine("Использование: /model <название>");
                    writeLine("");
                    return true;
                }

                const chosen = context.choose
                    ? await context.choose(
                        "Выбор модели",
                        models.map((m) => ({ value: m, label: m, hint: m === current ? "текущая" : undefined })),
                    )
                    : null;

                if (!chosen)
                {
                    writeLine("");
                    return true;
                }

                await context.setModel(chosen);
                writeLine(`Модель переключена: ${chosen}`);
                writeLine("");
                return true;
            }

            const models = await context.listModels();
            const matched = models.length > 0
                ? (models.find((m) => m.toLowerCase() === arg.toLowerCase()) ?? null)
                : arg;

            if (!matched)
            {
                writeLine("");
                writeLine(`Модель не найдена: ${arg}`);
                writeLine("Используйте /model без аргумента для выбора из списка");
                writeLine("");
                return true;
            }

            await context.setModel(matched);
            writeLine("");
            writeLine(`Модель переключена: ${matched}`);
            writeLine("");
            return true;
        },
    };
}
