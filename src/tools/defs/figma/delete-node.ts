import type { ToolHandler } from "@/tools/types";

export const name = "figma_delete_node";

export const handler: ToolHandler = async (args) =>
{
    const nodeId = String(args.nodeId ?? "");
    if (!nodeId) return { ok: false, output: "nodeId обязателен" };

    return {
        ok: true,
        output: `Нода "${nodeId}" удалена`,
        data: { type: "delete_node", nodeId },
    };
};
