import type { ToolHandler } from "@/tools/types";

export const name = "figma_set_gradient";

export const handler: ToolHandler = async (args) =>
{
    const nodeId = String(args.nodeId ?? "");
    if (!nodeId) return { ok: false, output: "nodeId обязателен" };

    return {
        ok: true,
        output: `Градиент "${nodeId}": ${String(args.from)} → ${String(args.to)} (${Number(args.angle ?? 0)}°)`,
        data: {
            type: "set_gradient",
            nodeId,
            from: String(args.from ?? "#FFFFFF"),
            to: String(args.to ?? "#000000"),
            ...(args.angle !== undefined ? { angle: Number(args.angle) } : {}),
        },
    };
};
