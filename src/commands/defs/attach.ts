import { writeLine } from "@/commands/io";
import type { Command, CommandsContext } from "@/commands/types";

const CLEAR_ALIASES = new Set(["clear", "reset", "clean"]);

export function createAttachCommand(context: CommandsContext): Command
{
    return {
        name: "/attach",
        description: "Прикрепить файл: /attach <путь>  |  /attach clear — сбросить всё",
        execute: async (args) =>
        {
            const raw = args.join(" ").trim().replace(/^["']|["']$/g, "");

            if (!raw)
            {
                const files = context.getPendingFiles?.() ?? [];
                writeLine("");
                if (files.length === 0)
                {
                    writeLine("Нет прикреплённых файлов.");
                    writeLine("Использование: /attach <путь>  |  /attach clear");
                }
                else
                {
                    writeLine(`Прикреплено файлов: ${files.length}`);
                    files.slice(0, 10).forEach((f, i) => writeLine(`  ${i + 1}: ${f.name}`));
                }
                writeLine("");
                return true;
            }

            if (CLEAR_ALIASES.has(raw.toLowerCase()))
            {
                const count = context.getPendingFiles?.().length ?? 0;
                context.clearPendingFiles?.();
                writeLine("");
                writeLine(count > 0 ? `Сброшено ${count} файл(ов).` : "Нет файлов для сброса.");
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
            writeLine(`Загружаем: ${raw}`);

            try
            {
                const { id, name } = await context.attachFile(raw);
                writeLine(`Прикреплён: ${name}  (${id})`);
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
