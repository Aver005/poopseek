import { writeLine } from "@/commands/io";
import type { Command, CommandsContext } from "@/commands/types";

export function createAttachCommand(context: CommandsContext): Command
{
    return {
        name: "/attach",
        description: "Прикрепить файл к следующему сообщению: /attach <путь>",
        execute: async (args) =>
        {
            const path = args.join(" ").trim().replace(/^["']|["']$/g, "");

            if (!path)
            {
                writeLine("");
                writeLine("Укажите путь к файлу: /attach <путь>");
                writeLine("");
                return true;
            }

            if (!context.attachFile)
            {
                writeLine("");
                writeLine("Прикрепление файлов доступно только с провайдером DeepSeek Web.");
                writeLine("");
                return true;
            }

            writeLine("");
            writeLine(`Загружаем файл: ${path}`);

            try
            {
                const { id, name } = await context.attachFile(path);
                writeLine(`Прикреплён: ${name}`);
                writeLine(`ID: ${id}`);
                writeLine("Файл будет отправлен вместе со следующим сообщением.");
            }
            catch (error)
            {
                const msg = error instanceof Error ? error.message : String(error);
                writeLine(`Ошибка загрузки: ${msg}`);
            }

            writeLine("");
            return true;
        },
    };
}
