import type { ToolHandler } from "@/tools/types";

export const name = "figma_create_line";

export const handler: ToolHandler = async (args) =>
{
    const id = args.id ? String(args.id) : undefined;
    const length = Number(args.length ?? 100);

    return {
        ok: true,
        output: `Создана линия длиной ${length}px`,
        data: {
            type: "create_line",
            ...(id ? { id } : {}),
            ...(args.frameId ? { frameId: String(args.frameId) } : {}),
            length,
            ...(args.x !== undefined ? { x: Number(args.x) } : {}),
            ...(args.y !== undefined ? { y: Number(args.y) } : {}),
            ...(args.rotation !== undefined ? { rotation: Number(args.rotation) } : {}),
            ...(args.color ? { color: String(args.color) } : {}),
            ...(args.weight !== undefined ? { weight: Number(args.weight) } : {}),
        },
    };
};
