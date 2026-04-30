import type { ToolHandler } from "@/tools/types";

export const name = "figma_set_font";

export const handler: ToolHandler = async (args) =>
{
    const nodeId = String(args.nodeId ?? "");
    if (!nodeId) return { ok: false, output: "nodeId обязателен" };

    return {
        ok: true,
        output: `Шрифт "${nodeId}": ${String(args.family)} ${String(args.style ?? "Regular")}`,
        data: {
            type: "set_font",
            nodeId,
            family: String(args.family ?? "Inter"),
            ...(args.style ? { style: String(args.style) } : {}),
        },
    };
};
