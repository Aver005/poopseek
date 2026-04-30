import type { ToolHandler } from "@/tools/types";

export const name = "figma_resize_node";

export const handler: ToolHandler = async (args) =>
{
    const nodeId = String(args.nodeId ?? "");
    if (!nodeId) return { ok: false, output: "nodeId обязателен" };

    return {
        ok: true,
        output: `Нода "${nodeId}" изменена до ${Number(args.width)}×${Number(args.height)}`,
        data: {
            type: "resize_node",
            nodeId,
            ...(args.width !== undefined ? { width: Number(args.width) } : {}),
            ...(args.height !== undefined ? { height: Number(args.height) } : {}),
        },
    };
};
