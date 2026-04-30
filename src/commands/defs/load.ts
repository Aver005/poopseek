import { colors } from "@/cli/colors";
import { writeLine } from "../io";
import type { Command, CommandsContext } from "../types";

const TYPE_LABELS: Record<"local" | "global", string> = {
    local: "ЛОКАЛЬНУЮ",
    global: "ГЛОБАЛЬНУЮ",
};

export function createLoadCommand(context: CommandsContext): Command
{
    const extractSessionId = (raw: string): string =>
    {
        const trimmed = raw.trim().replace(/^["'`]+|["'`]+$/g, "");
        const uuidMatch = trimmed.match(
            /(?:urn:uuid:)?([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12})/,
        );
        return (uuidMatch?.[1] ?? trimmed).trim();
    };

    return {
        name: "/load",
        description: "Загрузить сессию по ID (локальную или DeepSeek): /load <id>",
        execute: async (args) =>
        {
            const id = extractSessionId(args[0] ?? "");

            if (!id)
            {
                writeLine("");
                writeLine("Использование: /load <session_id>");
                writeLine("Пример: /load 2d2ae5cb-62bc-4434-a8df-f901a4acfbbd");
                writeLine("");
                return true;
            }

            const isUuid = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/.test(id);
            if (!isUuid)
            {
                writeLine("");
                writeLine(`Некорректный session_id: ${id}`);
                writeLine("");
                return true;
            }

            if (context.getAgentScope?.() === "figma")
            {
                writeLine("");
                writeLine(`Загрузка figma jam: ${id}`);
                const result = await (context.loadFigmaJam?.(id) ?? Promise.resolve({ error: "loadFigmaJam недоступен" }));
                if (result.error)
                {
                    writeLine(`Ошибка: ${result.error}`);
                }
                else
                {
                    writeLine(`Figma jam загружен: ${id}`);
                    writeLine("История восстановлена в контекст.");
                }
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

            context.setRenderEnabled?.(false);
            writeLine("");
            writeLine("Поиск сессии...");
            writeLine("");

            let resolved: Awaited<ReturnType<NonNullable<typeof context.resolveSessionForLoad>>>;
            try
            {
                resolved = await context.resolveSessionForLoad(id);
            }
            catch (error)
            {
                context.setRenderEnabled?.(true);
                const message = error instanceof Error ? error.message : String(error);
                writeLine(`Ошибка загрузки: ${message}`);
                writeLine("");
                return true;
            }

            context.setRenderEnabled?.(true);

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
