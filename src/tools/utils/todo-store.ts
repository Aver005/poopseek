import fs from "node:fs";
import path from "node:path";
import { getProjectMemoriesDir } from "./memory-path";

export type TodoStatus = "pending" | "in_progress" | "done";

export interface TodoItem
{
    id: string;
    content: string;
    status: TodoStatus;
}

const VALID_STATUSES = new Set<string>(["pending", "in_progress", "done"]);

function getTodoPath(workspaceRoot: string): string
{
    return path.join(getProjectMemoriesDir(workspaceRoot), "todo.json");
}

export async function readTodos(workspaceRoot: string): Promise<TodoItem[]>
{
    const todoPath = getTodoPath(workspaceRoot);
    try
    {
        const raw = await fs.promises.readFile(todoPath, "utf8");
        const parsed = JSON.parse(raw) as unknown;
        if (!Array.isArray(parsed)) return [];
        return parsed.filter(isValidItem);
    }
    catch (err)
    {
        const nodeErr = err as NodeJS.ErrnoException;
        if (nodeErr.code === "ENOENT" || err instanceof SyntaxError) return [];
        throw err;
    }
}

export async function writeTodos(workspaceRoot: string, items: TodoItem[]): Promise<void>
{
    const todoPath = getTodoPath(workspaceRoot);
    await fs.promises.mkdir(path.dirname(todoPath), { recursive: true });
    await fs.promises.writeFile(todoPath, JSON.stringify(items, null, 2) + "\n", "utf8");
}

function isValidItem(value: unknown): value is TodoItem
{
    if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
    const obj = value as Record<string, unknown>;
    return (
        typeof obj.id === "string" && obj.id.length > 0
        && typeof obj.content === "string" && obj.content.length > 0
        && typeof obj.status === "string" && VALID_STATUSES.has(obj.status)
    );
}

export function parseIncomingItems(raw: unknown): TodoItem[] | null
{
    if (!Array.isArray(raw)) return null;

    const items: TodoItem[] = [];
    for (let i = 0; i < raw.length; i++)
    {
        const entry = raw[i];
        if (typeof entry !== "object" || entry === null || Array.isArray(entry)) return null;

        const obj = entry as Record<string, unknown>;
        const content = typeof obj.content === "string" ? obj.content.trim() : null;
        if (!content) return null;

        const rawStatus = typeof obj.status === "string" ? obj.status.trim() : "pending";
        const status: TodoStatus = VALID_STATUSES.has(rawStatus)
            ? (rawStatus as TodoStatus)
            : "pending";

        const id = typeof obj.id === "string" && obj.id.trim().length > 0
            ? obj.id.trim()
            : String(i + 1);

        items.push({ id, content, status });
    }

    return items;
}

export function formatTodoList(items: TodoItem[]): string
{
    if (items.length === 0) return "Список задач пуст.";

    const done = items.filter((t) => t.status === "done").length;
    const inProgress = items.filter((t) => t.status === "in_progress").length;
    const pending = items.filter((t) => t.status === "pending").length;

    const parts: string[] = [];
    if (done > 0) parts.push(`${done} выполнена`);
    if (inProgress > 0) parts.push(`${inProgress} в работе`);
    if (pending > 0) parts.push(`${pending} ожидает`);
    const summary = `Задачи (${items.length}): ${parts.join(", ")}`;

    const lines = items.map((t) =>
    {
        const icon = t.status === "done" ? "[x]" : t.status === "in_progress" ? "[~]" : "[ ]";
        const suffix = t.status === "in_progress" ? "  ← сейчас" : "";
        return `${icon} ${t.id}. ${t.content}${suffix}`;
    });

    return [summary, "", ...lines].join("\n");
}
