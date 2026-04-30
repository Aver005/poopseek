import type { ToolHandler } from "@/tools/types";

export const name = "figma_set_shadow";

export const handler: ToolHandler = async (args) =>
{
    const nodeId = String(args.nodeId ?? "");
    if (!nodeId) return { ok: false, output: "nodeId обязателен" };

    return {
        ok: true,
        output: `Тень на "${nodeId}": blur=${Number(args.blur ?? 12)}, opacity=${Number(args.opacity ?? 0.12)}`,
        data: {
            type: "set_shadow",
            nodeId,
            ...(args.color ? { color: String(args.color) } : {}),
            ...(args.x !== undefined ? { x: Number(args.x) } : {}),
            ...(args.y !== undefined ? { y: Number(args.y) } : {}),
            ...(args.blur !== undefined ? { blur: Number(args.blur) } : {}),
            ...(args.spread !== undefined ? { spread: Number(args.spread) } : {}),
            ...(args.opacity !== undefined ? { opacity: Number(args.opacity) } : {}),
        },
    };
};
