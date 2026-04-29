import type { ToolHandler } from "@/tools/types";

export const name = "figma_create_text";

export const handler: ToolHandler = async (args) =>
{
    const id = args.id ? String(args.id) : undefined;
    const content = String(args.content ?? "");
    const frameId = args.frameId ? String(args.frameId) : undefined;

    return {
        ok: true,
        output: `Создан текст "${content.slice(0, 40)}${content.length > 40 ? "…" : ""}"${frameId ? ` в "${frameId}"` : ""}`,
        data: {
            type: "create_text",
            ...(id ? { id } : {}),
            ...(frameId ? { frameId } : {}),
            content,
            ...(args.x !== undefined ? { x: Number(args.x) } : {}),
            ...(args.y !== undefined ? { y: Number(args.y) } : {}),
            ...(args.fontSize !== undefined ? { fontSize: Number(args.fontSize) } : {}),
            ...(args.fontWeight ? { fontWeight: String(args.fontWeight) } : {}),
            ...(args.color ? { color: String(args.color) } : {}),
        },
    };
};
