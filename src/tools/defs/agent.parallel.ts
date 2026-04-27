import type { SubAgentTask, ToolHandler } from "../types";

export const name = "agent.parallel";

function isRecord(value: unknown): value is Record<string, unknown>
{
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toStringArray(value: unknown): string[] | undefined
{
    if (!Array.isArray(value)) return undefined;
    const result = value.filter((item): item is string => typeof item === "string");
    return result.length > 0 ? result : undefined;
}

function toStringRecord(value: unknown): Record<string, string> | undefined
{
    if (!isRecord(value)) return undefined;
    const record: Record<string, string> = {};
    for (const [k, v] of Object.entries(value))
    {
        if (typeof v === "string") record[k] = v;
    }
    return Object.keys(record).length > 0 ? record : undefined;
}

function parseTask(raw: unknown): SubAgentTask | null
{
    if (!isRecord(raw)) return null;
    const instruction = typeof raw.instruction === "string" ? raw.instruction.trim() : "";
    if (!instruction) return null;
    return {
        instruction,
        files: toStringArray(raw.files),
        context: toStringRecord(raw.context),
        schema: typeof raw.schema === "string" ? raw.schema : undefined,
    };
}

export const handler: ToolHandler = async (args, context) =>
{
    if (!context.spawnSubAgents)
    {
        return { ok: false, output: "Sub-agent support not initialized", error: "not_available" };
    }

    const rawTasks = Array.isArray(args.tasks) ? args.tasks : [];
    const tasks = rawTasks.map(parseTask).filter((t): t is SubAgentTask => t !== null);

    if (tasks.length === 0)
    {
        return { ok: false, output: "No valid tasks provided (each task needs args.instruction)", error: "no_tasks" };
    }

    const results = await context.spawnSubAgents(tasks);

    const allOk = results.every((r) => r.ok);
    const dataArray = results.map((r, i) => ({
        task: tasks[i]!.instruction.slice(0, 80),
        ok: r.ok,
        data: r.data,
        error: r.error,
    }));

    return {
        ok: allOk,
        output: JSON.stringify(dataArray, null, 2),
        data: dataArray,
    };
};
