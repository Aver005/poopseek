import path from "node:path";
import { writeLine } from "../io";
import type { Command, CommandsContext } from "../types";
import type { AgentMessage } from "@/agent/types";

function formatDate(iso: string): string
{
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString("ru-RU", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    });
}

function buildMarkdown(sessionId: string, createdAt: string, messages: AgentMessage[]): string
{
    const header = [
        "# Экспорт сессии",
        "",
        `**ID:** ${sessionId}`,
        `**Создана:** ${formatDate(createdAt)}`,
        `**Сообщений:** ${messages.length}`,
        "",
        "---",
        "",
    ].join("\n");

    const body = messages.map((msg) =>
    {
        if (msg.role === "user") return `### Пользователь\n\n${msg.content}\n\n---\n`;
        if (msg.role === "assistant") return `### Ассистент\n\n${msg.content}\n\n---\n`;
        return `### Инструмент: ${msg.name ?? "unknown"}\n\n${msg.content}\n\n---\n`;
    }).join("\n");

    return header + body;
}

export function createExportCommand(context: CommandsContext): Command
{
    return {
        name: "/export",
        description: "Экспортировать сессию в Markdown: /export [sessionId]",
        execute: async (args) =>
        {
            const sessionId = args[0]?.trim() ?? "";

            let messages: AgentMessage[];
            let id: string;
            let createdAt: string;

            if (sessionId)
            {
                if (!context.loadSessionById)
                {
                    writeLine("");
                    writeLine("Загрузка сессий недоступна");
                    writeLine("");
                    return true;
                }

                const snapshot = await context.loadSessionById(sessionId);
                if (!snapshot)
                {
                    writeLine("");
                    writeLine(`Сессия не найдена: ${sessionId}`);
                    writeLine("");
                    return true;
                }

                messages = snapshot.context.messages;
                id = snapshot.id;
                createdAt = snapshot.createdAt;
            }
            else
            {
                if (!context.getCurrentSessionSnapshot)
                {
                    writeLine("");
                    writeLine("Информация о сессии недоступна");
                    writeLine("");
                    return true;
                }

                const snap = context.getCurrentSessionSnapshot();

                if (snap.messages.length === 0)
                {
                    writeLine("");
                    writeLine("Текущая сессия пуста — нечего экспортировать");
                    writeLine("");
                    return true;
                }

                messages = snap.messages;
                id = snap.sessionId;
                createdAt = snap.createdAt;
            }

            const content = buildMarkdown(id, createdAt, messages);
            const fileName = `session-${id}.md`;
            const filePath = path.join(process.cwd(), fileName);
            await Bun.write(filePath, content);

            writeLine("");
            writeLine(`Сессия экспортирована: ${filePath}`);
            writeLine(`Сообщений: ${messages.length}`);
            writeLine("");
            return true;
        },
    };
}
