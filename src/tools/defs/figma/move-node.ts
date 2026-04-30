import type { ToolHandler } from "@/tools/types";

export const name = "figma_move_node";

export const handler: ToolHandler = async (args) =>
{
    const nodeId = String(args.nodeId ?? "");
    if (!nodeId) return { ok: false, output: "nodeId обязателен" };

    return {
        ok: true,
        output: `Нода "${nodeId}" перемещена в (${Number(args.x ?? 0)}, ${Number(args.y ?? 0)})`,
        data: {
            type: "move_node",
            nodeId,
            ...(args.x !== undefined ? { x: Number(args.x) } : {}),
            ...(args.y !== undefined ? { y: Number(args.y) } : {}),
        },
    };
};
