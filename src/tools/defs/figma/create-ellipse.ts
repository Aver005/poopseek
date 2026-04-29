import type { ToolHandler } from "@/tools/types";

export const name = "figma_create_ellipse";

export const handler: ToolHandler = async (args) =>
{
    const id = args.id ? String(args.id) : undefined;
    const ellipseName = args.name ? String(args.name) : undefined;
    const frameId = args.frameId ? String(args.frameId) : undefined;
    const width = Number(args.width ?? 100);
    const height = Number(args.height ?? 100);

    return {
        ok: true,
        output: `Создан эллипс ${width}×${height}${frameId ? ` в "${frameId}"` : ""}`,
        data: {
            type: "create_ellipse",
            ...(id ? { id } : {}),
            ...(ellipseName ? { name: ellipseName } : {}),
            ...(frameId ? { frameId } : {}),
            width,
            height,
            ...(args.x !== undefined ? { x: Number(args.x) } : {}),
            ...(args.y !== undefined ? { y: Number(args.y) } : {}),
            ...(args.fill ? { fill: String(args.fill) } : {}),
        },
    };
};
