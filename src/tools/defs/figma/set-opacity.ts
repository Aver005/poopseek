import type { ToolHandler } from "@/tools/types";

export const name = "figma_set_opacity";

export const handler: ToolHandler = async (args) =>
{
    const nodeId = String(args.nodeId ?? "");
    if (!nodeId) return { ok: false, output: "nodeId обязателен" };

    return {
        ok: true,
        output: `Прозрачность "${nodeId}": ${Number(args.opacity ?? 1)}`,
        data: { type: "set_opacity", nodeId, opacity: Number(args.opacity ?? 1) },
    };
};
