import type { ToolHandler } from "@/tools/types";

export const name = "figma_set_fill";

export const handler: ToolHandler = async (args) =>
{
    const nodeId = String(args.nodeId ?? "");
    const color = String(args.color ?? "#000000");

    if (!nodeId)
    {
        return { ok: false, output: "nodeId обязателен", error: "nodeId required" };
    }

    return {
        ok: true,
        output: `Установлена заливка ${color} для "${nodeId}"`,
        data: {
            type: "set_fill",
            nodeId,
            color,
        },
    };
};
