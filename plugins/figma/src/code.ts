declare const __html__: string;

figma.showUI(__html__, { width: 320, height: 480, title: "PoopSeek" });

interface FigmaSnapshotNode
{
    id: string;
    type: string;
    name: string;
    width?: number;
    height?: number;
    x?: number;
    y?: number;
    layoutMode?: string;
    text?: string;
    visible?: boolean;
    children?: FigmaSnapshotNode[];
}

interface FigmaPluginSnapshot
{
    source: "plugin";
    receivedAt: number;
    nodeCount: number;
    selectedNodeIds: string[];
    tree: FigmaSnapshotNode[];
    jsx: string;
    documentName?: string;
}

interface FigmaOp
{
    type: string;
    id?: string;
    [key: string]: unknown;
}

interface RGB { r: number; g: number; b: number; }
interface RGBA extends RGB { a: number; }
interface VariableColorValue
{
    kind: "variable-color";
    hex: string;
    variable: {
        collection: string;
        mode: string;
        name: string;
        resolvedType: "COLOR";
    };
}

type ColorInput = string | VariableColorValue;
interface EnsureColorVariablesOp extends FigmaOp
{
    type: "ensure_color_variables";
    collection: string;
    mode: string;
    tokens: Array<{
        key: string;
        name: string;
        hex: string;
    }>;
}
interface EnsureThemeVariablesOp extends FigmaOp
{
    type: "ensure_theme_variables";
    collection: string;
    mode: string;
    themeName: string;
    tokens: Array<{
        token: string;
        variableName: string;
        hex: string;
        description?: string;
    }>;
}

const nodeMap = new Map<string, string>();
const collectionCache = new Map<string, VariableCollection>();
const colorVariableCache = new Map<string, Variable>();

function getLogicalId(figmaId: string): string
{
    for (const [logicalId, mappedId] of nodeMap.entries())
    {
        if (mappedId === figmaId) return logicalId;
    }
    return figmaId;
}

function serializeNode(node: BaseNode): FigmaSnapshotNode | null
{
    if ("type" in node === false) return null;

    const base: FigmaSnapshotNode = {
        id: getLogicalId(node.id),
        type: node.type,
        name: "name" in node && typeof node.name === "string" ? node.name : node.type,
        visible: "visible" in node ? Boolean(node.visible) : true,
    };

    if ("width" in node && typeof node.width === "number") base.width = node.width;
    if ("height" in node && typeof node.height === "number") base.height = node.height;
    if ("x" in node && typeof node.x === "number") base.x = node.x;
    if ("y" in node && typeof node.y === "number") base.y = node.y;
    if ("layoutMode" in node && typeof node.layoutMode === "string") base.layoutMode = node.layoutMode;
    if (node.type === "TEXT") base.text = (node as TextNode).characters;

    if ("children" in node)
    {
        const children = (node as ChildrenMixin).children
            .map((child) => serializeNode(child))
            .filter((child): child is FigmaSnapshotNode => child !== null);
        if (children.length > 0) base.children = children;
    }

    return base;
}

function nodeTag(node: FigmaSnapshotNode, isTopLevel: boolean): string
{
    if (node.type === "TEXT") return "Text";
    if (node.type === "RECTANGLE") return "Rect";
    if (node.type === "ELLIPSE") return "Ellipse";
    if (node.type === "LINE") return "Line";
    if (node.type === "FRAME")
    {
        if (isTopLevel) return "Screen";
        if (node.layoutMode === "VERTICAL") return "VStack";
        if (node.layoutMode === "HORIZONTAL") return "HStack";
        return "Frame";
    }
    return node.type;
}

function escapeJsxText(value: string): string
{
    return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function snapshotNodeToJsx(node: FigmaSnapshotNode, depth: number, isTopLevel: boolean): string
{
    const indent = "  ".repeat(depth);
    const tag = nodeTag(node, isTopLevel);
    const props: string[] = [];

    if (node.name) props.push(`name="${node.name.replace(/"/g, "&quot;")}"`);
    if (node.width !== undefined && isTopLevel) props.push(`width="${Math.round(node.width)}"`);
    if (node.height !== undefined && isTopLevel) props.push(`height="${Math.round(node.height)}"`);

    if (node.type === "TEXT")
    {
        const text = escapeJsxText(node.text ?? "");
        return `${indent}<${tag}${props.length > 0 ? ` ${props.join(" ")}` : ""}>${text}</${tag}>`;
    }

    const children = node.children ?? [];
    if (children.length === 0)
        return `${indent}<${tag}${props.length > 0 ? ` ${props.join(" ")}` : ""} />`;

    const childJsx = children.map((child) => snapshotNodeToJsx(child, depth + 1, false)).join("\n");
    return `${indent}<${tag}${props.length > 0 ? ` ${props.join(" ")}` : ""}>\n${childJsx}\n${indent}</${tag}>`;
}

function countSnapshotNodes(nodes: FigmaSnapshotNode[]): number
{
    return nodes.reduce((total, node) => total + 1 + countSnapshotNodes(node.children ?? []), 0);
}

function buildPluginSnapshot(): FigmaPluginSnapshot
{
    const roots = (figma.currentPage.selection.length > 0
        ? figma.currentPage.selection
        : figma.currentPage.children)
        .map((node) => serializeNode(node))
        .filter((node): node is FigmaSnapshotNode => node !== null);

    return {
        source: "plugin",
        receivedAt: Date.now(),
        nodeCount: countSnapshotNodes(roots),
        selectedNodeIds: figma.currentPage.selection.map((node) => getLogicalId(node.id)),
        tree: roots,
        jsx: roots.map((node) => snapshotNodeToJsx(node, 0, true)).join("\n"),
        documentName: figma.root.name || undefined,
    };
}

function parseColor(c: string): RGBA | null
{
    // rgba(r, g, b, a) or rgb(r, g, b)
    const rgba = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\s*\)$/.exec(c);
    if (rgba)
        return { r: Number(rgba[1]) / 255, g: Number(rgba[2]) / 255, b: Number(rgba[3]) / 255, a: rgba[4] !== undefined ? Number(rgba[4]) : 1 };
    const hex = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})?$/i.exec(c);
    if (hex)
        return { r: parseInt(hex[1]!, 16) / 255, g: parseInt(hex[2]!, 16) / 255, b: parseInt(hex[3]!, 16) / 255, a: hex[4] ? parseInt(hex[4], 16) / 255 : 1 };
    return null;
}

function isVariableColorValue(value: unknown): value is VariableColorValue
{
    if (!value || typeof value !== "object") return false;
    const record = value as Record<string, unknown>;
    return record.kind === "variable-color" && typeof record.hex === "string";
}

async function getOrCreateCollection(name: string): Promise<VariableCollection>
{
    const cached = collectionCache.get(name);
    if (cached) return cached;

    const collections = await figma.variables.getLocalVariableCollectionsAsync();
    const existing = collections.find((collection) => collection.name === name);
    const collection = existing ?? figma.variables.createVariableCollection(name);
    collectionCache.set(name, collection);
    return collection;
}

async function getOrCreateColorVariable(value: VariableColorValue): Promise<Variable>
{
    const cacheKey = `${value.variable.collection}::${value.variable.name}`;
    const cached = colorVariableCache.get(cacheKey);
    if (cached) return cached;

    const collection = await getOrCreateCollection(value.variable.collection);
    const variables = await figma.variables.getLocalVariablesAsync("COLOR");
    let variable = variables.find((item) =>
        item.variableCollectionId === collection.id && item.name === value.variable.name);

    if (!variable)
        variable = figma.variables.createVariable(value.variable.name, collection, "COLOR");

    const color = parseColor(value.hex);
    if (color)
    {
        const modeId = collection.modes[0]?.modeId;
        if (modeId) variable.setValueForMode(modeId, color);
    }

    colorVariableCache.set(cacheKey, variable);
    return variable;
}

async function ensureColorVariables(op: EnsureColorVariablesOp): Promise<void>
{
    const collection = await getOrCreateCollection(op.collection);
    const modeId = collection.modes[0]?.modeId;
    if (!modeId) return;

    const variables = await figma.variables.getLocalVariablesAsync("COLOR");
    const byName = new Map(
        variables
            .filter((item) => item.variableCollectionId === collection.id)
            .map((item) => [item.name, item] as const),
    );

    for (const token of op.tokens)
    {
        let variable = byName.get(token.name);
        if (!variable)
        {
            variable = figma.variables.createVariable(token.name, collection, "COLOR");
            byName.set(token.name, variable);
        }

        const color = parseColor(token.hex);
        if (color) variable.setValueForMode(modeId, color);
        colorVariableCache.set(`${op.collection}::${token.name}`, variable);
    }
}

async function ensureThemeVariables(op: EnsureThemeVariablesOp): Promise<void>
{
    const collection = await getOrCreateCollection(op.collection);
    const modeId = collection.modes[0]?.modeId;
    if (!modeId) return;

    const variables = await figma.variables.getLocalVariablesAsync("COLOR");
    const byName = new Map(
        variables
            .filter((item) => item.variableCollectionId === collection.id)
            .map((item) => [item.name, item] as const),
    );

    for (const token of op.tokens)
    {
        let variable = byName.get(token.variableName);
        if (!variable)
        {
            variable = figma.variables.createVariable(token.variableName, collection, "COLOR");
            byName.set(token.variableName, variable);
        }

        const color = parseColor(token.hex);
        if (color) variable.setValueForMode(modeId, color);
        colorVariableCache.set(`${op.collection}::${token.variableName}`, variable);
    }
}

async function solidPaint(input: ColorInput): Promise<SolidPaint | null>
{
    const baseColor = typeof input === "string" ? input : input.hex;
    const p = parseColor(baseColor);
    if (!p) return null;
    const paint: SolidPaint = {
        type: "SOLID",
        color: { r: p.r, g: p.g, b: p.b },
        visible: true,
        blendMode: "NORMAL",
        opacity: p.a,
    };

    if (!isVariableColorValue(input))
        return paint;

    const variable = await getOrCreateColorVariable(input);
    return figma.variables.setBoundVariableForPaint(paint, "color", variable);
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

function applyLayoutSizing(node: SceneNode, op: FigmaOp): void
{
    if (op.fillParent && "layoutSizingHorizontal" in node)
        (node as SceneNode & { layoutSizingHorizontal: "FIXED" | "HUG" | "FILL" }).layoutSizingHorizontal = "FILL";
    if (op.fillParentHeight && "layoutSizingVertical" in node)
        (node as SceneNode & { layoutSizingVertical: "FIXED" | "HUG" | "FILL" }).layoutSizingVertical = "FILL";
}

function applyCornerRadii(
    node: SceneNode,
    op: FigmaOp,
): void
{
    if ("topLeftRadius" in node && op.cornerRadiusTopLeft !== undefined)
        (node as SceneNode & { topLeftRadius: number }).topLeftRadius = Number(op.cornerRadiusTopLeft);
    if ("topRightRadius" in node && op.cornerRadiusTopRight !== undefined)
        (node as SceneNode & { topRightRadius: number }).topRightRadius = Number(op.cornerRadiusTopRight);
    if ("bottomLeftRadius" in node && op.cornerRadiusBottomLeft !== undefined)
        (node as SceneNode & { bottomLeftRadius: number }).bottomLeftRadius = Number(op.cornerRadiusBottomLeft);
    if ("bottomRightRadius" in node && op.cornerRadiusBottomRight !== undefined)
        (node as SceneNode & { bottomRightRadius: number }).bottomRightRadius = Number(op.cornerRadiusBottomRight);
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
                case "ensure_color_variables":
                {
                    await ensureColorVariables(op as EnsureColorVariablesOp);
                    count++;
                    break;
                }

                case "ensure_theme_variables":
                {
                    await ensureThemeVariables(op as EnsureThemeVariablesOp);
                    count++;
                    break;
                }

                // ── Primitives ──────────────────────────────────────────

                case "create_frame":
                {
                    const frame = figma.createFrame();
                    frame.name = String(op.name ?? "Frame");
                    frame.resize(Number(op.width ?? 100), Number(op.height ?? 100));
                    if (op.fill !== undefined)
                    {
                        const paint = await solidPaint(op.fill as ColorInput);
                        frame.fills = paint ? [paint] : [];
                    }
                    else
                    {
                        frame.fills = [];  // Transparent — no white box for layout containers
                    }
                    if (op.cornerRadius !== undefined) frame.cornerRadius = Number(op.cornerRadius);
                    applyCornerRadii(frame, op);
                    if (op.clipContent !== undefined) frame.clipsContent = Boolean(op.clipContent);
                    const parent = resolveParent(op.frameId);
                    parent.appendChild(frame);
                    if (op.x !== undefined) frame.x = Number(op.x);  // Position after append (relative to parent)
                    if (op.y !== undefined) frame.y = Number(op.y);
                    applyLayoutSizing(frame, op);
                    if (op.id) nodeMap.set(op.id, frame.id);
                    count++;
                    break;
                }

                case "create_rect":
                {
                    const parent = resolveParent(op.frameId);
                    const rect = figma.createRectangle();
                    rect.resize(Number(op.width ?? 100), Number(op.height ?? 100));
                    if (op.fill !== undefined)
                    {
                        const paint = await solidPaint(op.fill as ColorInput);
                        if (paint) rect.fills = [paint];
                    }
                    if (op.cornerRadius !== undefined) rect.cornerRadius = Number(op.cornerRadius);
                    applyCornerRadii(rect, op);
                    if (op.name) rect.name = String(op.name);
                    parent.appendChild(rect);
                    if (op.x !== undefined) rect.x = Number(op.x);
                    if (op.y !== undefined) rect.y = Number(op.y);
                    applyLayoutSizing(rect, op);
                    if (op.id) nodeMap.set(op.id, rect.id);
                    count++;
                    break;
                }

                case "create_ellipse":
                {
                    const parent = resolveParent(op.frameId);
                    const ellipse = figma.createEllipse();
                    ellipse.resize(Number(op.width ?? 100), Number(op.height ?? 100));
                    if (op.fill !== undefined)
                    {
                        const paint = await solidPaint(op.fill as ColorInput);
                        if (paint) ellipse.fills = [paint];
                    }
                    if (op.name) ellipse.name = String(op.name);
                    parent.appendChild(ellipse);
                    if (op.x !== undefined) ellipse.x = Number(op.x);
                    if (op.y !== undefined) ellipse.y = Number(op.y);
                    applyLayoutSizing(ellipse, op);
                    if (op.id) nodeMap.set(op.id, ellipse.id);
                    count++;
                    break;
                }

                case "create_image":
                {
                    const parent = resolveParent(op.frameId);
                    const rect = figma.createRectangle();
                    rect.resize(Number(op.width ?? 160), Number(op.height ?? 100));
                    rect.name = String(op.name ?? "Image");
                    if (op.cornerRadius !== undefined) rect.cornerRadius = Number(op.cornerRadius);
                    applyCornerRadii(rect, op);
                    parent.appendChild(rect);
                    if (op.x !== undefined) rect.x = Number(op.x);
                    if (op.y !== undefined) rect.y = Number(op.y);
                    applyLayoutSizing(rect, op);

                    let imageApplied = false;
                    if (typeof op.src === "string" && op.src.trim().length > 0)
                    {
                        try
                        {
                            const response = await fetch(op.src);
                            if (response.ok)
                            {
                                const bytes = new Uint8Array(await response.arrayBuffer());
                                const image = figma.createImage(bytes);
                                rect.fills = [{
                                    type: "IMAGE",
                                    imageHash: image.hash,
                                    scaleMode: "FILL",
                                }];
                                imageApplied = true;
                            }
                        }
                        catch (error)
                        {
                            console.error(`Image fetch failed for ${String(op.src)}:`, error);
                        }
                    }

                    if (!imageApplied && op.fill !== undefined)
                    {
                        const paint = await solidPaint(op.fill as ColorInput);
                        if (paint) rect.fills = [paint];
                    }

                    if (op.id) nodeMap.set(op.id, rect.id);
                    count++;
                    break;
                }

                case "create_text":
                {
                    const parent = resolveParent(op.frameId);
                    const weightMap: Record<string, string> = {
                        Bold: "Bold", SemiBold: "Semi Bold", Medium: "Medium",
                        Regular: "Regular", Light: "Light",
                        "700": "Bold", "600": "Semi Bold", "500": "Medium",
                        "400": "Regular", "300": "Light",
                    };
                    const style = weightMap[String(op.fontWeight ?? "Regular")] ?? "Regular";
                    await figma.loadFontAsync({ family: "Inter", style });
                    const text = figma.createText();
                    text.characters = String(op.content ?? "");
                    text.fontName = { family: "Inter", style };
                    if (op.fontSize !== undefined) text.fontSize = Number(op.fontSize);
                    if (op.width !== undefined)
                    {
                        text.textAutoResize = "HEIGHT";
                        text.resize(Number(op.width), text.height || 24);
                    }
                    if (op.color !== undefined)
                    {
                        const paint = await solidPaint(op.color as ColorInput);
                        if (paint) text.fills = [paint];
                    }
                    if (op.name) text.name = String(op.name);
                    parent.appendChild(text);
                    if (op.x !== undefined) text.x = Number(op.x);
                    if (op.y !== undefined) text.y = Number(op.y);
                    applyLayoutSizing(text, op);
                    if (op.fillParent) text.textAutoResize = "HEIGHT";
                    if (op.id) nodeMap.set(op.id, text.id);
                    count++;
                    break;
                }

                case "create_line":
                {
                    const parent = resolveParent(op.frameId);
                    const line = figma.createLine();
                    line.resize(Number(op.length ?? 100), 0);
                    if (op.rotation !== undefined) line.rotation = Number(op.rotation);
                    const linePaint = await solidPaint((op.color as ColorInput | undefined) ?? "#E5E5E5");
                    if (linePaint) line.strokes = [linePaint];
                    line.strokeWeight = op.weight !== undefined ? Number(op.weight) : 1;
                    if (op.name) line.name = String(op.name);
                    parent.appendChild(line);
                    if (op.x !== undefined) line.x = Number(op.x);
                    if (op.y !== undefined) line.y = Number(op.y);
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

                case "set_corner_radius":
                {
                    const node = resolveNode(op.nodeId);
                    if (node && "cornerRadius" in node)
                    {
                        (node as SceneNode & { cornerRadius: number }).cornerRadius = Number(op.cornerRadius ?? 0);
                        applyCornerRadii(node as SceneNode, op);
                    }
                    count++;
                    break;
                }

                case "set_clip_content":
                {
                    const node = resolveNode(op.nodeId);
                    if (node && node.type === "FRAME")
                        (node as FrameNode).clipsContent = Boolean(op.clipContent);
                    count++;
                    break;
                }

                // ── Fill & Style ─────────────────────────────────────────

                case "set_fill":
                {
                    const node = resolveNode(op.nodeId);
                    if (node && "fills" in node && op.color !== undefined)
                    {
                        const paint = await solidPaint(op.color as ColorInput);
                        if (paint) (node as GeometryMixin).fills = [paint];
                    }
                    count++;
                    break;
                }

                case "set_stroke":
                {
                    const node = resolveNode(op.nodeId);
                    if (node && "strokes" in node && op.color !== undefined)
                    {
                        const paint = await solidPaint(op.color as ColorInput);
                        if (paint)
                        {
                            (node as GeometryMixin).strokes = [paint];
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
                        const rgb = typeof op.color === "string" ? (parseColor(op.color) ?? { r: 0, g: 0, b: 0, a: 1 }) : { r: 0, g: 0, b: 0, a: 1 };
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
                        const rgb1 = parseColor(op.from);
                        const rgb2 = parseColor(op.to);
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
                        const direction = op.direction
                            ? String(op.direction) as "HORIZONTAL" | "VERTICAL" | "NONE"
                            : frame.layoutMode;
                        // Setting layoutMode resets Figma's sizing modes to AUTO — we fix them below
                        if (op.direction) frame.layoutMode = direction;

                        // Restore sizing after potential reset by layoutMode change.
                        // hugMain controls the PRIMARY axis (height for VERTICAL, width for HORIZONTAL).
                        // hugCross controls the COUNTER axis (width for VERTICAL, height for HORIZONTAL).
                        const isVertical = direction === "VERTICAL";
                        type SizingMode = "FIXED" | "HUG" | "FILL";
                        const f = frame as FrameNode & {
                            layoutSizingHorizontal: SizingMode;
                            layoutSizingVertical: SizingMode;
                        };

                        if (isVertical)
                        {
                            // Primary axis = height
                            f.layoutSizingVertical = op.hugMain ? "HUG" : "FIXED";
                            // Counter axis = width: FILL if fillParent, else FIXED (never HUG — VStack always stretches)
                            f.layoutSizingHorizontal = op.fillParent ? "FILL" : "FIXED";
                        }
                        else
                        {
                            // Primary axis = width
                            f.layoutSizingHorizontal = op.fillParent ? "FILL" : (op.hugMain ? "HUG" : "FIXED");
                            // Counter axis = height
                            f.layoutSizingVertical = op.fillParentHeight ? "FILL" : (op.hugCross ? "HUG" : "FIXED");
                        }

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
                        if (op.paddingLeft !== undefined) frame.paddingLeft = Number(op.paddingLeft);
                        if (op.paddingRight !== undefined) frame.paddingRight = Number(op.paddingRight);
                        if (op.paddingTop !== undefined) frame.paddingTop = Number(op.paddingTop);
                        if (op.paddingBottom !== undefined) frame.paddingBottom = Number(op.paddingBottom);
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
            const countBefore = figma.currentPage.children.length;
            const count = await executeOps(msg.ops);
            if (count > 0)
            {
                const newTopLevel = figma.currentPage.children.slice(countBefore);
                const toView = newTopLevel.length > 0 ? newTopLevel : figma.currentPage.children.slice(-1);
                figma.viewport.scrollAndZoomIntoView(toView);
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

    if (msg.type === "REQUEST_SNAPSHOT")
    {
        figma.ui.postMessage({
            type: "SNAPSHOT",
            snapshot: buildPluginSnapshot(),
        });
    }
};
