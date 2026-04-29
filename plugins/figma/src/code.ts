declare const __html__: string;

figma.showUI(__html__, { width: 320, height: 480, title: "PoopSeek" });

interface FigmaOp
{
    type: string;
    id?: string;
    [key: string]: unknown;
}

interface RGB
{
    r: number;
    g: number;
    b: number;
}

const nodeMap = new Map<string, string>();

function hexToRgb(hex: string): RGB | null
{
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!result) return null;
    return {
        r: parseInt(result[1]!, 16) / 255,
        g: parseInt(result[2]!, 16) / 255,
        b: parseInt(result[3]!, 16) / 255,
    };
}

function resolveParent(frameId: unknown): FrameNode | PageNode
{
    if (typeof frameId === "string")
    {
        const figmaId = nodeMap.get(frameId);
        if (figmaId)
        {
            const node = figma.getNodeById(figmaId);
            if (node && node.type === "FRAME") return node as FrameNode;
        }
    }
    return figma.currentPage;
}

async function executeOps(ops: FigmaOp[]): Promise<number>
{
    let count = 0;

    for (const op of ops)
    {
        try
        {
            switch (op.type)
            {
                case "create_frame":
                {
                    const frame = figma.createFrame();
                    frame.name = String(op.name ?? "Frame");
                    frame.resize(Number(op.width ?? 100), Number(op.height ?? 100));
                    if (op.x !== undefined) frame.x = Number(op.x);
                    if (op.y !== undefined) frame.y = Number(op.y);
                    if (typeof op.fill === "string")
                    {
                        const rgb = hexToRgb(op.fill);
                        if (rgb) frame.fills = [{ type: "SOLID", color: rgb }];
                    }
                    figma.currentPage.appendChild(frame);
                    if (op.id) nodeMap.set(op.id, frame.id);
                    count++;
                    break;
                }

                case "create_text":
                {
                    const parent = resolveParent(op.frameId);
                    await figma.loadFontAsync({ family: "Inter", style: "Regular" });
                    const text = figma.createText();
                    text.characters = String(op.content ?? "");
                    if (op.x !== undefined) text.x = Number(op.x);
                    if (op.y !== undefined) text.y = Number(op.y);
                    if (op.fontSize !== undefined) text.fontSize = Number(op.fontSize);
                    if (op.fontWeight === "Bold")
                    {
                        await figma.loadFontAsync({ family: "Inter", style: "Bold" });
                        text.fontName = { family: "Inter", style: "Bold" };
                    }
                    if (typeof op.color === "string")
                    {
                        const rgb = hexToRgb(op.color);
                        if (rgb) text.fills = [{ type: "SOLID", color: rgb }];
                    }
                    parent.appendChild(text);
                    if (op.id) nodeMap.set(op.id, text.id);
                    count++;
                    break;
                }

                case "create_rect":
                {
                    const parent = resolveParent(op.frameId);
                    const rect = figma.createRectangle();
                    rect.resize(Number(op.width ?? 100), Number(op.height ?? 100));
                    if (op.x !== undefined) rect.x = Number(op.x);
                    if (op.y !== undefined) rect.y = Number(op.y);
                    if (typeof op.fill === "string")
                    {
                        const rgb = hexToRgb(op.fill);
                        if (rgb) rect.fills = [{ type: "SOLID", color: rgb }];
                    }
                    if (op.cornerRadius !== undefined) rect.cornerRadius = Number(op.cornerRadius);
                    if (op.name) rect.name = String(op.name);
                    parent.appendChild(rect);
                    if (op.id) nodeMap.set(op.id, rect.id);
                    count++;
                    break;
                }

                case "create_ellipse":
                {
                    const parent = resolveParent(op.frameId);
                    const ellipse = figma.createEllipse();
                    ellipse.resize(Number(op.width ?? 100), Number(op.height ?? 100));
                    if (op.x !== undefined) ellipse.x = Number(op.x);
                    if (op.y !== undefined) ellipse.y = Number(op.y);
                    if (typeof op.fill === "string")
                    {
                        const rgb = hexToRgb(op.fill);
                        if (rgb) ellipse.fills = [{ type: "SOLID", color: rgb }];
                    }
                    if (op.name) ellipse.name = String(op.name);
                    parent.appendChild(ellipse);
                    if (op.id) nodeMap.set(op.id, ellipse.id);
                    count++;
                    break;
                }

                case "set_fill":
                {
                    const figmaId = typeof op.nodeId === "string" ? nodeMap.get(op.nodeId) : undefined;
                    if (figmaId && typeof op.color === "string")
                    {
                        const node = figma.getNodeById(figmaId);
                        if (node && "fills" in node)
                        {
                            const rgb = hexToRgb(op.color);
                            if (rgb) (node as GeometryMixin).fills = [{ type: "SOLID", color: rgb }];
                        }
                    }
                    count++;
                    break;
                }

                case "clear_canvas":
                {
                    nodeMap.clear();
                    break;
                }
            }
        }
        catch (err)
        {
            console.error(`Op "${op.type}" failed:`, err);
        }
    }

    return count;
}

figma.ui.onmessage = async (msg: { type: string; ops?: FigmaOp[] }) =>
{
    if (msg.type === "EXECUTE_OPS" && msg.ops)
    {
        try
        {
            const count = await executeOps(msg.ops);
            if (count > 0)
            {
                const created = figma.currentPage.children.slice(-count);
                figma.viewport.scrollAndZoomIntoView(created);
            }
            figma.ui.postMessage({ type: "OPS_DONE", count });
        }
        catch (err)
        {
            figma.ui.postMessage({ type: "OPS_ERROR", error: String(err) });
        }
    }

    if (msg.type === "CLOSE")
    {
        figma.closePlugin();
    }
};
