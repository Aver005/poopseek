import type { ToolHandler } from "../types";
import { formatTodoList, readTodos } from "../utils/todo-store";

export const name = "todo.read";

export const handler: ToolHandler = async (_args, context) =>
{
    const items = await readTodos(context.workspaceRoot);
    const output = formatTodoList(items);
    return {
        ok: true,
        output,
        data: { items },
    };
};
