import type { ToolHandler } from "@/tools/types";

export const name = "figma_set_stroke";

export const handler: ToolHandler = async (args) =>
{
    const nodeId = String(args.nodeId ?? "");
    if (!nodeId) return { ok: false, output: "nodeId обязателен" };

    return {
        ok: true,
        output: `Обводка "${nodeId}": ${String(args.color ?? "#000000")} ${Number(args.weight ?? 1)}px`,
        data: {
            type: "set_stroke",
            nodeId,
            color: String(args.color ?? "#000000"),
            ...(args.weight !== undefined ? { weight: Number(args.weight) } : {}),
            ...(args.align ? { align: String(args.align) } : {}),
        },
    };
};
