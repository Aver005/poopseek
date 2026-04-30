import type { ToolHandler } from "@/tools/types";

export const name = "figma_clone_node";

export const handler: ToolHandler = async (args) =>
{
    const nodeId = String(args.nodeId ?? "");
    if (!nodeId) return { ok: false, output: "nodeId обязателен" };

    return {
        ok: true,
        output: `Нода "${nodeId}" клонирована${args.newId ? ` → "${String(args.newId)}"` : ""}`,
        data: {
            type: "clone_node",
            nodeId,
            ...(args.newId ? { newId: String(args.newId) } : {}),
            ...(args.offsetX !== undefined ? { offsetX: Number(args.offsetX) } : {}),
            ...(args.offsetY !== undefined ? { offsetY: Number(args.offsetY) } : {}),
        },
    };
};
