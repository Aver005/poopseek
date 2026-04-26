import type { ToolHandler } from "../types";
import { formatTodoList, parseIncomingItems, writeTodos } from "../utils/todo-store";

export const name = "todo.write";

export const handler: ToolHandler = async (args, context) =>
{
    const items = parseIncomingItems(args.items);
    if (items === null)
    {
        return {
            ok: false,
            output: 'Ошибка: args.items должен быть массивом объектов с полями "content" и "status" (pending|in_progress|done)',
            error: "Invalid items format",
        };
    }

    await writeTodos(context.workspaceRoot, items);

    const done = items.filter((t) => t.status === "done").length;
    const inProgress = items.filter((t) => t.status === "in_progress").length;
    const pending = items.filter((t) => t.status === "pending").length;

    const inProgressItem = items.find((t) => t.status === "in_progress");
    const currentTask = inProgressItem ? ` Сейчас: "${inProgressItem.content}".` : "";

    return {
        ok: true,
        output: `Список задач обновлён (${items.length}): ${done} выполнено, ${inProgress} в работе, ${pending} ожидает.${currentTask}`,
        data: { items, counts: { done, inProgress, pending, total: items.length } },
    };
};
