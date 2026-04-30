import type { ToolHandler } from "@/tools/types";

export const name = "figma_group_nodes";

export const handler: ToolHandler = async (args) =>
{
    const nodeIds = Array.isArray(args.nodeIds) ? (args.nodeIds as string[]) : [];
    if (nodeIds.length === 0) return { ok: false, output: "nodeIds обязателен (массив ID)" };

    return {
        ok: true,
        output: `Сгруппировано ${nodeIds.length} нод${args.name ? ` → "${String(args.name)}"` : ""}`,
        data: {
            type: "group_nodes",
            nodeIds,
            ...(args.name ? { name: String(args.name) } : {}),
            ...(args.id ? { id: String(args.id) } : {}),
        },
    };
};
