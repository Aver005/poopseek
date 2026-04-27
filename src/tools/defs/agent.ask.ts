import type { ToolHandler } from "../types";

export const name = "agent.ask";

function toStringArray(value: unknown): string[] | undefined
{
    if (!Array.isArray(value)) return undefined;
    const result = value.filter((item): item is string => typeof item === "string");
    return result.length > 0 ? result : undefined;
}

function toStringRecord(value: unknown): Record<string, string> | undefined
{
    if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
    const record: Record<string, string> = {};
    for (const [k, v] of Object.entries(value))
    {
        if (typeof v === "string") record[k] = v;
    }
    return Object.keys(record).length > 0 ? record : undefined;
}

export const handler: ToolHandler = async (args, context) =>
{
    if (!context.spawnSubAgent)
    {
        return { ok: false, output: "Sub-agent support not initialized", error: "not_available" };
    }

    const instruction = typeof args.instruction === "string" ? args.instruction.trim() : "";
    if (!instruction)
    {
        return { ok: false, output: "Missing required args.instruction", error: "missing_instruction" };
    }

    const result = await context.spawnSubAgent({
        instruction,
        files: toStringArray(args.files),
        context: toStringRecord(args.context),
        schema: typeof args.schema === "string" ? args.schema : undefined,
    });

    return {
        ok: result.ok,
        output: result.ok
            ? (result.data !== null ? JSON.stringify(result.data, null, 2) : (result.raw ?? ""))
            : (result.error ?? "Sub-agent failed"),
        data: result.data,
        error: result.error,
    };
};
