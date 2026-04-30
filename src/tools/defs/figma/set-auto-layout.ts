import type { ToolHandler } from "@/tools/types";

export const name = "figma_set_auto_layout";

export const handler: ToolHandler = async (args) =>
{
    const nodeId = String(args.nodeId ?? "");
    if (!nodeId) return { ok: false, output: "nodeId обязателен" };

    return {
        ok: true,
        output: `Auto Layout установлен на "${nodeId}" (${String(args.direction ?? "VERTICAL")})`,
        data: {
            type: "set_auto_layout",
            nodeId,
            ...(args.direction ? { direction: String(args.direction) } : {}),
            ...(args.gap !== undefined ? { gap: Number(args.gap) } : {}),
            ...(args.paddingH !== undefined ? { paddingH: Number(args.paddingH) } : {}),
            ...(args.paddingV !== undefined ? { paddingV: Number(args.paddingV) } : {}),
            ...(args.align ? { align: String(args.align) } : {}),
            ...(args.counterAlign ? { counterAlign: String(args.counterAlign) } : {}),
        },
    };
};
