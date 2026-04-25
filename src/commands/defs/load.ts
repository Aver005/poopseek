import { colors } from "@/cli/colors";
import { writeLine } from "../io";
import type { Command, CommandsContext } from "../types";

const TYPE_LABELS: Record<"local" | "global", string> = {
    local: "ЛОКАЛЬНУЮ",
    global: "ГЛОБАЛЬНУЮ",
};

export function createLoadCommand(context: CommandsContext): Command
{
    return {
        name: "/load",
        description: "Загрузить сессию по ID (локальную или DeepSeek): /load <id>",
        execute: async (args) =>
        {
            const id = args[0]?.trim() ?? "";

            if (!id)
            {
                writeLine("");
                writeLine("Использование: /load <session_id>");
                writeLine("Пример: /load 2d2ae5cb-62bc-4434-a8df-f901a4acfbbd");
                writeLine("");
                return true;
            }

            if (!context.resolveSessionForLoad)
            {
                writeLine("");
                writeLine("Загрузка сессий недоступна");
                writeLine("");
                return true;
            }

            writeLine("");
            writeLine("Поиск сессии...");
            writeLine("");

            const resolved = await context.resolveSessionForLoad(id);

            if (!resolved)
            {
                writeLine(`Сессия не найдена: ${id}`);
                writeLine("");
                return true;
            }

            const typeLabel = TYPE_LABELS[resolved.type];
            const countPart = resolved.messageCount !== undefined
                ? ` (${resolved.messageCount} сообщ.)`
                : "";
            const message = `Загрузить ${colors.yellow(typeLabel)} сессию\n«${colors.cyan(resolved.title)}»${countPart}?`;

            const confirmed = await (context.confirm?.(message) ?? Promise.resolve(true));

            writeLine("");

            if (!confirmed)
            {
                writeLine("Отменено");
                writeLine("");
                return true;
            }

            const result = await resolved.load();

            if (result.error)
            {
                writeLine(`Ошибка: ${result.error}`);
            }
            else
            {
                writeLine(`Сессия загружена: «${resolved.title}»`);
            }

            writeLine("");
            return true;
        },
    };
}
