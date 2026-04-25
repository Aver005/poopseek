import { writeLine } from "../io";
import type { Command, CommandsContext } from "../types";

export function createLoadCommand(context: CommandsContext): Command
{
    return {
        name: "/load",
        description: "Загрузить историю чата DeepSeek по ID сессии: /load <session_id>",
        execute: async (args) =>
        {
            const sessionId = args[0]?.trim() ?? "";

            if (!sessionId)
            {
                writeLine("");
                writeLine("Использование: /load <deepseek_session_id>");
                writeLine("Пример: /load 2d2ae5cb-62bc-4434-a8df-f901a4acfbbd");
                writeLine("");
                return true;
            }

            if (!context.loadDeepseekSession)
            {
                writeLine("");
                writeLine("Загрузка сессии DeepSeek недоступна");
                writeLine("");
                return true;
            }

            writeLine("");
            writeLine(`Загрузка истории из DeepSeek (${sessionId})...`);

            const result = await context.loadDeepseekSession(sessionId);

            if (!result.loaded)
            {
                writeLine(`Ошибка: ${result.error ?? "не удалось загрузить сессию"}`);
                writeLine("");
                return true;
            }

            const titlePart = result.title ? ` "${result.title}"` : "";
            const countPart = result.messageCount !== undefined
                ? ` (${result.messageCount} сообщений)`
                : "";
            writeLine(`Сессия загружена:${titlePart}${countPart}`);
            writeLine("");
            return true;
        },
    };
}
