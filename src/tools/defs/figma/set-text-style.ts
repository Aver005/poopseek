import type { ToolHandler } from "@/tools/types";

export const name = "figma_set_text_style";

export const handler: ToolHandler = async (args) =>
{
    const nodeId = String(args.nodeId ?? "");
    if (!nodeId) return { ok: false, output: "nodeId обязателен" };

    return {
        ok: true,
        output: `Стиль текста "${nodeId}" обновлён`,
        data: {
            type: "set_text_style",
            nodeId,
            ...(args.align ? { align: String(args.align) } : {}),
            ...(args.lineHeight !== undefined ? { lineHeight: Number(args.lineHeight) } : {}),
            ...(args.letterSpacing !== undefined ? { letterSpacing: Number(args.letterSpacing) } : {}),
            ...(args.decoration ? { decoration: String(args.decoration) } : {}),
        },
    };
};
