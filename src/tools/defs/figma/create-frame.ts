import type { ToolHandler } from "@/tools/types";

export const name = "figma_create_frame";

export const handler: ToolHandler = async (args) =>
{
    const id = String(args.id ?? `frame_${Date.now()}`);
    const frameName = String(args.name ?? "Frame");
    const width = Number(args.width ?? 375);
    const height = Number(args.height ?? 812);

    return {
        ok: true,
        output: `Создан фрейм "${frameName}" ${width}×${height}, id="${id}"`,
        data: {
            type: "create_frame",
            id,
            name: frameName,
            width,
            height,
            ...(args.x !== undefined ? { x: Number(args.x) } : {}),
            ...(args.y !== undefined ? { y: Number(args.y) } : {}),
            ...(args.fill ? { fill: String(args.fill) } : {}),
        },
    };
};
