import { writeLine } from "@/commands/io";
import type { Command, CommandsContext } from "@/commands/types";

export function createFigmaCommand(context: CommandsContext): Command
{
    return {
        name: "/figma",
        description: "Figma-сервер для плагина; /figma [start|stop|status]",
        execute: async (args) =>
        {
            if (!context.getFigmaServerStatus || !context.startFigmaServer || !context.stopFigmaServer)
            {
                writeLine("");
                writeLine("Figma-сервер недоступен");
                writeLine("");
                return true;
            }

            const sub = args[0]?.toLowerCase() ?? "";
            const { running, port } = context.getFigmaServerStatus();

            if (sub === "status")
            {
                writeLine("");
                writeLine(`Figma-сервер: ${running ? `запущен — http://localhost:${port}` : "не запущен"}`);
                writeLine("");
                return true;
            }

            const shouldStart = sub === "start" || (sub === "" && !running);
            const shouldStop = sub === "stop" || (sub === "" && running);

            if (shouldStart)
            {
                if (running)
                {
                    writeLine("");
                    writeLine(`Уже запущен — http://localhost:${port}`);
                    writeLine("");
                    return true;
                }
                await context.startFigmaServer();
                const updated = context.getFigmaServerStatus();
                writeLine("");
                writeLine(`Figma-сервер запущен — http://localhost:${updated.port}`);
                writeLine("Откройте Figma Desktop → Plugins → PoopSeek");
                writeLine("");
                return true;
            }

            if (shouldStop)
            {
                if (!running)
                {
                    writeLine("");
                    writeLine("Сервер не запущен");
                    writeLine("");
                    return true;
                }
                await context.stopFigmaServer();
                writeLine("");
                writeLine("Figma-сервер остановлен");
                writeLine("");
                return true;
            }

            writeLine("");
            writeLine("Использование: /figma [start|stop|status]");
            writeLine("");
            return true;
        },
    };
}
