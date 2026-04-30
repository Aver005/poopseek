declare const __html__: string;

figma.showUI(__html__, { width: 320, height: 480, title: "PoopSeek" });

interface FigmaOp
{
    type: string;
    id?: string;
    [key: string]: unknown;
}

interface RGB { r: number; g: number; b: number; }

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

// angle: 0° = top→bottom, 90° = left→right
function angleToGradientTransform(angleDeg: number): [[number, number, number], [number, number, number]]
{
    const rad = (angleDeg * Math.PI) / 180;
    const s = Math.sin(rad);
    const c = Math.cos(rad);
    return [
        [s, -c, 0.5 - s / 2],
        [c,  s, 0.5 - c / 2],
    ];
}

function resolveNode(nodeId: unknown): BaseNode | null
{
    if (typeof nodeId !== "string") return null;
    const figmaId = nodeMap.get(nodeId);
    return figmaId ? figma.getNodeById(figmaId) : null;
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
                // ── Primitives ──────────────────────────────────────────

                case "create_frame":
                {
                    const frame = figma.createFrame();
                    frame.name = String(op.name ?? "Frame");
                    frame.resize(Number(op.width ?? 390), Number(op.height ?? 844));
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

                case "create_text":
                {
                    const parent = resolveParent(op.frameId);
                    const isBold = op.fontWeight === "Bold";
                    await figma.loadFontAsync({ family: "Inter", style: isBold ? "Bold" : "Regular" });
                    const text = figma.createText();
                    text.characters = String(op.content ?? "");
                    if (op.x !== undefined) text.x = Number(op.x);
                    if (op.y !== undefined) text.y = Number(op.y);
                    if (op.fontSize !== undefined) text.fontSize = Number(op.fontSize);
                    if (isBold) text.fontName = { family: "Inter", style: "Bold" };
                    if (typeof op.color === "string")
                    {
                        const rgb = hexToRgb(op.color);
                        if (rgb) text.fills = [{ type: "SOLID", color: rgb }];
                    }
                    if (op.name) text.name = String(op.name);
                    parent.appendChild(text);
                    if (op.id) nodeMap.set(op.id, text.id);
                    count++;
                    break;
                }

                case "create_line":
                {
                    const parent = resolveParent(op.frameId);
                    const line = figma.createLine();
                    if (op.x !== undefined) line.x = Number(op.x);
                    if (op.y !== undefined) line.y = Number(op.y);
                    line.resize(Number(op.length ?? 100), 0);
                    if (op.rotation !== undefined) line.rotation = Number(op.rotation);
                    const lineColor = typeof op.color === "string" ? hexToRgb(op.color) : hexToRgb("#E5E5E5");
                    if (lineColor) line.strokes = [{ type: "SOLID", color: lineColor }];
                    line.strokeWeight = op.weight !== undefined ? Number(op.weight) : 1;
                    if (op.name) line.name = String(op.name);
                    parent.appendChild(line);
                    if (op.id) nodeMap.set(op.id, line.id);
                    count++;
                    break;
                }

                // ── Transform ───────────────────────────────────────────

                case "move_node":
                {
                    const node = resolveNode(op.nodeId);
                    if (node && "x" in node)
                    {
                        if (op.x !== undefined) (node as { x: number }).x = Number(op.x);
                        if (op.y !== undefined) (node as { y: number }).y = Number(op.y);
                    }
                    count++;
                    break;
                }

                case "resize_node":
                {
                    const node = resolveNode(op.nodeId);
                    if (node && "resize" in node)
                    {
                        const r = node as FrameNode | RectangleNode | EllipseNode;
                        r.resize(
                            op.width !== undefined ? Number(op.width) : r.width,
                            op.height !== undefined ? Number(op.height) : r.height,
                        );
                    }
                    count++;
                    break;
                }

                case "delete_node":
                {
                    const node = resolveNode(op.nodeId);
                    if (node)
                    {
                        node.remove();
                        if (typeof op.nodeId === "string") nodeMap.delete(op.nodeId);
                    }
                    count++;
                    break;
                }

                case "clone_node":
                {
                    const node = resolveNode(op.nodeId);
                    if (node && "clone" in node)
                    {
                        const clone = (node as SceneNode).clone();
                        if (op.offsetX !== undefined && "x" in clone) (clone as { x: number }).x += Number(op.offsetX);
                        if (op.offsetY !== undefined && "y" in clone) (clone as { y: number }).y += Number(op.offsetY);
                        (node as SceneNode).parent?.appendChild(clone);
                        if (typeof op.newId === "string") nodeMap.set(op.newId, clone.id);
                    }
                    count++;
                    break;
                }

                case "rename_node":
                {
                    const node = resolveNode(op.nodeId);
                    if (node && "name" in node) node.name = String(op.name ?? "");
                    count++;
                    break;
                }

                // ── Fill & Style ─────────────────────────────────────────

                case "set_fill":
                {
                    const node = resolveNode(op.nodeId);
                    if (node && "fills" in node && typeof op.color === "string")
                    {
                        const rgb = hexToRgb(op.color);
                        if (rgb) (node as GeometryMixin).fills = [{ type: "SOLID", color: rgb }];
                    }
                    count++;
                    break;
                }

                case "set_stroke":
                {
                    const node = resolveNode(op.nodeId);
                    if (node && "strokes" in node && typeof op.color === "string")
                    {
                        const rgb = hexToRgb(op.color);
                        if (rgb)
                        {
                            (node as GeometryMixin).strokes = [{ type: "SOLID", color: rgb }];
                            if (op.weight !== undefined) (node as GeometryMixin).strokeWeight = Number(op.weight);
                            if (op.align) (node as GeometryMixin).strokeAlign = String(op.align) as "INSIDE" | "OUTSIDE" | "CENTER";
                        }
                    }
                    count++;
                    break;
                }

                case "set_opacity":
                {
                    const node = resolveNode(op.nodeId);
                    if (node && "opacity" in node) (node as BlendMixin).opacity = Number(op.opacity ?? 1);
                    count++;
                    break;
                }

                case "set_shadow":
                {
                    const node = resolveNode(op.nodeId);
                    if (node && "effects" in node)
                    {
                        const rgb = typeof op.color === "string" ? (hexToRgb(op.color) ?? { r: 0, g: 0, b: 0 }) : { r: 0, g: 0, b: 0 };
                        const shadow: DropShadowEffect = {
                            type: "DROP_SHADOW",
                            color: { r: rgb.r, g: rgb.g, b: rgb.b, a: Number(op.opacity ?? 0.12) },
                            offset: { x: Number(op.x ?? 0), y: Number(op.y ?? 4) },
                            radius: Number(op.blur ?? 12),
                            spread: Number(op.spread ?? 0),
                            visible: true,
                            blendMode: "NORMAL",
                        };
                        const existing = (node as BlendMixin).effects.filter((e) => e.type !== "DROP_SHADOW");
                        (node as BlendMixin).effects = [...existing, shadow];
                    }
                    count++;
                    break;
                }

                case "set_gradient":
                {
                    const node = resolveNode(op.nodeId);
                    if (node && "fills" in node && typeof op.from === "string" && typeof op.to === "string")
                    {
                        const rgb1 = hexToRgb(op.from);
                        const rgb2 = hexToRgb(op.to);
                        if (rgb1 && rgb2)
                        {
                            const transform = angleToGradientTransform(Number(op.angle ?? 0));
                            (node as GeometryMixin).fills = [{
                                type: "GRADIENT_LINEAR",
                                gradientTransform: transform,
                                gradientStops: [
                                    { position: 0, color: { r: rgb1.r, g: rgb1.g, b: rgb1.b, a: 1 } },
                                    { position: 1, color: { r: rgb2.r, g: rgb2.g, b: rgb2.b, a: 1 } },
                                ],
                            }];
                        }
                    }
                    count++;
                    break;
                }

                // ── Typography ───────────────────────────────────────────

                case "set_text_style":
                {
                    const node = resolveNode(op.nodeId);
                    if (node && node.type === "TEXT")
                    {
                        const text = node as TextNode;
                        if (op.align) text.textAlignHorizontal = String(op.align) as "LEFT" | "CENTER" | "RIGHT" | "JUSTIFIED";
                        if (op.lineHeight !== undefined) text.lineHeight = { unit: "PIXELS", value: Number(op.lineHeight) };
                        if (op.letterSpacing !== undefined) text.letterSpacing = { unit: "PERCENT", value: Number(op.letterSpacing) };
                        if (op.decoration) text.textDecoration = String(op.decoration) as "NONE" | "UNDERLINE" | "STRIKETHROUGH";
                    }
                    count++;
                    break;
                }

                case "set_font":
                {
                    const node = resolveNode(op.nodeId);
                    if (node && node.type === "TEXT" && typeof op.family === "string")
                    {
                        const style = typeof op.style === "string" ? op.style : "Regular";
                        await figma.loadFontAsync({ family: op.family, style });
                        (node as TextNode).fontName = { family: op.family, style };
                    }
                    count++;
                    break;
                }

                // ── Auto Layout ──────────────────────────────────────────

                case "set_auto_layout":
                {
                    const node = resolveNode(op.nodeId);
                    if (node && node.type === "FRAME")
                    {
                        const frame = node as FrameNode;
                        if (op.direction) frame.layoutMode = String(op.direction) as "HORIZONTAL" | "VERTICAL" | "NONE";
                        if (op.gap !== undefined) frame.itemSpacing = Number(op.gap);
                        if (op.paddingH !== undefined)
                        {
                            frame.paddingLeft = Number(op.paddingH);
                            frame.paddingRight = Number(op.paddingH);
                        }
                        if (op.paddingV !== undefined)
                        {
                            frame.paddingTop = Number(op.paddingV);
                            frame.paddingBottom = Number(op.paddingV);
                        }
                        if (op.align) frame.primaryAxisAlignItems = String(op.align) as "MIN" | "MAX" | "CENTER" | "SPACE_BETWEEN";
                        if (op.counterAlign) frame.counterAxisAlignItems = String(op.counterAlign) as "MIN" | "MAX" | "CENTER" | "BASELINE";
                    }
                    count++;
                    break;
                }

                // ── Organisation ─────────────────────────────────────────

                case "group_nodes":
                {
                    if (Array.isArray(op.nodeIds) && op.nodeIds.length > 0)
                    {
                        const nodes = (op.nodeIds as string[])
                            .map((id) => { const fid = nodeMap.get(id); return fid ? figma.getNodeById(fid) : null; })
                            .filter((n): n is SceneNode => n !== null && "type" in n && n.type !== "PAGE" && n.type !== "DOCUMENT");

                        if (nodes.length > 0)
                        {
                            const parent = (nodes[0]!.parent ?? figma.currentPage) as PageNode | FrameNode;
                            const group = figma.group(nodes, parent);
                            if (op.name) group.name = String(op.name);
                            if (op.id) nodeMap.set(String(op.id), group.id);
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
