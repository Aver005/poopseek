import type { ToolHandler } from "../types";
import { parseIncomingItems, readTodos, writeTodos } from "../utils/todo-store";

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

    const previous = await readTodos(context.workspaceRoot);
    await writeTodos(context.workspaceRoot, items);

    const done = items.filter((t) => t.status === "done").length;
    const inProgress = items.filter((t) => t.status === "in_progress").length;
    const pending = items.filter((t) => t.status === "pending").length;

    const inProgressItem = items.find((t) => t.status === "in_progress");
    const currentTask = inProgressItem ? ` Сейчас: "${inProgressItem.content}".` : "";

    const prevMap = new Map(previous.map((t) => [t.id, t]));
    const newMap = new Map(items.map((t) => [t.id, t]));
    const added = items.filter((t) => !prevMap.has(t.id));
    const removed = previous.filter((t) => !newMap.has(t.id));
    const statusChanged = items
        .filter((t) => { const p = prevMap.get(t.id); return p !== undefined && p.status !== t.status; })
        .map((t) => ({ item: t, prevStatus: prevMap.get(t.id)!.status }));

    return {
        ok: true,
        output: `Список задач обновлён (${items.length}): ${done} выполнено, ${inProgress} в работе, ${pending} ожидает.${currentTask}`,
        data: { items, counts: { done, inProgress, pending, total: items.length }, changes: { added, removed, statusChanged } },
    };
};
