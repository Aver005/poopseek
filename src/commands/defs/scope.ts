import { writeLine } from "@/commands/io";
import type { Command, CommandsContext } from "@/commands/types";

export function createScopeCommand(context: CommandsContext): Command
{
    return {
        name: "/scope",
        description: "Переключить режим агента: /scope [figma|chat]",
        execute: async (args) =>
        {
            const sub = args[0]?.toLowerCase() ?? "";
            const current = context.getAgentScope?.() ?? "chat";

            if (!sub)
            {
                writeLine("");
                writeLine(`Текущий scope: ${current}`);
                writeLine("  /scope figma  — режим Figma-дизайна (figma_* инструменты в CLI)");
                writeLine("  /scope chat   — обычный чат-режим");
                if (current === "figma")
                {
                    const jamId = context.getFigmaJamId?.();
                    if (jamId) writeLine(`  Jam ID: ${jamId}`);
                }
                writeLine("");
                return true;
            }

            if (sub === "figma")
            {
                if (current === "figma")
                {
                    writeLine("");
                    writeLine("Уже в figma scope.");
                    writeLine("");
                    return true;
                }

                const status = context.getFigmaServerStatus?.();
                if (!status?.running)
                {
                    writeLine("");
                    writeLine("Предупреждение: Figma-сервер не запущен (плагин не получит ops).");
                    writeLine("Запустите /figma start для соединения с плагином.");
                }

                await context.enterFigmaScope?.();

                writeLine("");
                writeLine("Scope: figma");
                const jamId = context.getFigmaJamId?.();
                if (jamId) writeLine(`Jam: ${jamId}`);
                writeLine("Используй figma_* инструменты напрямую из чата.");
                writeLine("");
                return true;
            }

            if (sub === "chat")
            {
                if (current === "chat")
                {
                    writeLine("");
                    writeLine("Уже в chat scope.");
                    writeLine("");
                    return true;
                }

                context.exitFigmaScope?.();
                writeLine("");
                writeLine("Scope: chat");
                writeLine("");
                return true;
            }

            writeLine("");
            writeLine(`Неизвестный scope: ${sub}. Доступно: figma, chat`);
            writeLine("");
            return true;
        },
    };
}
