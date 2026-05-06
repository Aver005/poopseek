import type { FigmaOp, RGBA, ColorInput, VariableColorValue, EnsureColorVariablesOp, EnsureThemeVariablesOp, FigmaSnapshotNode, FigmaPluginSnapshot } from "./types";
import { nodeMap, collectionCache, colorVariableCache } from "./cache";

// ── ID mapping ─────────────────────────────────────────────────

export function getLogicalId(figmaId: string): string
{
    for (const [logicalId, mappedId] of nodeMap.entries())
    {
        if (mappedId === figmaId) return logicalId;
    }
    return figmaId;
}

// ── Color utilities ────────────────────────────────────────────

export function rgbaToHex(rgb: { r: number; g: number; b: number }): string
{
    return "#" + [rgb.r, rgb.g, rgb.b]
        .map(v => Math.round(v * 255).toString(16).padStart(2, "0"))
        .join("");
}

export function getPrimaryColor(paints: ReadonlyArray<Paint> | typeof figma.mixed): string | undefined
{
    if (paints === figma.mixed || !Array.isArray(paints)) return undefined;
    const solid = (paints as Paint[]).find((p): p is SolidPaint => p.type === "SOLID" && p.visible !== false);
    return solid ? rgbaToHex(solid.color) : undefined;
}

export function parseColor(c: string): RGBA | null
{
    const rgbaRegex = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\s*\)$/;
    const rgba = rgbaRegex.exec(c);
    if (rgba)
        return { r: Number(rgba[1]) / 255, g: Number(rgba[2]) / 255, b: Number(rgba[3]) / 255, a: rgba[4] !== undefined ? Number(rgba[4]) : 1 };
    const hex = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})?$/i.exec(c);
    if (hex)
        return { r: parseInt(hex[1]!, 16) / 255, g: parseInt(hex[2]!, 16) / 255, b: parseInt(hex[3]!, 16) / 255, a: hex[4] ? parseInt(hex[4], 16) / 255 : 1 };
    return null;
}

export function isVariableColorValue(value: unknown): value is VariableColorValue
{
    if (!value || typeof value !== "object") return false;
    const record = value as Record<string, unknown>;
    return record.kind === "variable-color" && typeof record.hex === "string";
}

// ── Font / alignment utilities ─────────────────────────────────

export function fontWeightFromStyle(style: string): string
{
    const s = style.toLowerCase();
    if (s.includes("semi") || s.includes("demi")) return "semibold";
    if (s.includes("bold")) return "bold";
    if (s.includes("medium")) return "medium";
    return "regular";
}

export function figmaAlignToJsx(align: string): string
{
    if (align === "CENTER") return "center";
    if (align === "MAX") return "end";
    if (align === "SPACE_BETWEEN") return "between";
    return "start";
}

export function escapeJsxText(value: string): string
{
    return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ── JSX generation ─────────────────────────────────────────────

export function nodeToFullJsx(node: SceneNode, depth: number): string
{
    const indent = "  ".repeat(depth);
    const t = node.type;

    if (t === "TEXT") {
        const tn = node as TextNode;
        const parts: string[] = [`name="${tn.name.replace(/"/g, "&quot;")}"`];
        const lsh = "layoutSizingHorizontal" in tn
            ? (tn as unknown as { layoutSizingHorizontal: string }).layoutSizingHorizontal
            : "FIXED";
        if (lsh === "FILL") parts.push(`width="fill"`);
        else if (tn.width > 0) parts.push(`width={${Math.round(tn.width)}}`);
        const fc = getPrimaryColor(tn.fills);
        if (fc) parts.push(`fill="${fc}"`);
        if (tn.fontSize !== figma.mixed) parts.push(`fontSize={${tn.fontSize as number}}`);
        if (tn.fontName !== figma.mixed) {
            const fw = fontWeightFromStyle((tn.fontName as FontName).style);
            if (fw !== "regular") parts.push(`fontWeight="${fw}"`);
        }
        const taMap: Record<string, string> = { CENTER: "center", RIGHT: "right" };
        const ta = taMap[tn.textAlignHorizontal];
        if (ta) parts.push(`alignX="${ta}"`);
        if (tn.opacity !== 1) parts.push(`opacity={${Math.round(tn.opacity * 100) / 100}}`);
        return `${indent}<Text ${parts.join(" ")}>${escapeJsxText(tn.characters)}</Text>`;
    }

    if (t === "ELLIPSE") {
        const el = node as EllipseNode;
        const parts = [`name="${el.name.replace(/"/g, "&quot;")}"`, `width={${Math.round(el.width)}}`, `height={${Math.round(el.height)}}`];
        const fc = getPrimaryColor(el.fills);
        if (fc) parts.push(`fill="${fc}"`);
        const sc = getPrimaryColor(el.strokes);
        if (sc) { parts.push(`stroke="${sc}"`); if (typeof el.strokeWeight === "number" && el.strokeWeight !== 1) parts.push(`strokeWidth={${el.strokeWeight}}`); }
        return `${indent}<Ellipse ${parts.join(" ")} />`;
    }

    if (t === "LINE") {
        const ln = node as LineNode;
        const parts = [`name="${ln.name.replace(/"/g, "&quot;")}"`, `length={${Math.round(Math.max(ln.width, ln.height))}}`];
        if (ln.height > ln.width) parts.push("vertical");
        const sc = getPrimaryColor(ln.strokes);
        if (sc) { parts.push(`stroke="${sc}"`); if (typeof ln.strokeWeight === "number" && ln.strokeWeight !== 1) parts.push(`strokeWidth={${ln.strokeWeight}}`); }
        return `${indent}<Line ${parts.join(" ")} />`;
    }

    if (t === "RECTANGLE") {
        const rect = node as RectangleNode;
        const fills = Array.isArray(rect.fills) ? rect.fills as Paint[] : [];
        const imgFill = fills.find((p): p is ImagePaint => p.type === "IMAGE");
        const parts = [`name="${rect.name.replace(/"/g, "&quot;")}"`];
        const lsh = "layoutSizingHorizontal" in rect
            ? (rect as unknown as { layoutSizingHorizontal: string }).layoutSizingHorizontal
            : "FIXED";
        parts.push(lsh === "FILL" ? `width="fill"` : `width={${Math.round(rect.width)}}`);
        parts.push(`height={${Math.round(rect.height)}}`);
        if (typeof rect.cornerRadius === "number" && rect.cornerRadius > 0) parts.push(`radius={${rect.cornerRadius}}`);
        if (imgFill) {
            parts.push(`src="${imgFill.imageHash ?? "image"}"`);
            return `${indent}<Image ${parts.join(" ")} />`;
        }
        const fc = getPrimaryColor(fills);
        if (fc) parts.push(`fill="${fc}"`);
        return `${indent}<Rect ${parts.join(" ")} />`;
    }

    if (!("children" in node)) return "";

    const f = node as FrameNode;
    const parts: string[] = [`name="${f.name.replace(/"/g, "&quot;")}"`];
    const isAL = "layoutMode" in f && (f as FrameNode).layoutMode !== "NONE";
    if (isAL) {
        parts.push("autoLayout");
        if ((f as FrameNode).layoutMode === "HORIZONTAL") parts.push(`flow="horizontal"`);
    }
    const lsh = "layoutSizingHorizontal" in f ? (f as FrameNode).layoutSizingHorizontal : "FIXED";
    const lsv = "layoutSizingVertical"   in f ? (f as FrameNode).layoutSizingVertical   : "FIXED";
    parts.push(lsh === "FILL" ? `width="fill"` : lsh === "HUG" ? `width="hug"` : `width={${Math.round(f.width)}}`);
    parts.push(lsv === "FILL" ? `height="fill"` : lsv === "HUG" ? `height="hug"` : `height={${Math.round(f.height)}}`);
    if ("fills" in f) { const fc = getPrimaryColor((f as FrameNode).fills); if (fc) parts.push(`fill="${fc}"`); }
    if ("strokes" in f) {
        const sc = getPrimaryColor((f as FrameNode).strokes);
        if (sc) {
            parts.push(`stroke="${sc}"`);
            const sw = (f as FrameNode).strokeWeight;
            if (typeof sw === "number" && sw > 0) parts.push(`strokeWidth={${sw}}`);
        }
    }
    if ("cornerRadius" in f) {
        const cr = (f as FrameNode).cornerRadius;
        if (cr !== figma.mixed && typeof cr === "number" && cr > 0) parts.push(`radius={${cr}}`);
    }
    if (isAL) {
        const ff = f as FrameNode;
        if (ff.itemSpacing > 0) parts.push(`gap={${ff.itemSpacing}}`);
        const pL = ff.paddingLeft ?? 0, pR = ff.paddingRight ?? 0;
        const pT = ff.paddingTop  ?? 0, pB = ff.paddingBottom ?? 0;
        if (pL === pR && pL > 0) parts.push(`padX={${pL}}`);
        else { if (pL > 0) parts.push(`padLeft={${pL}}`); if (pR > 0) parts.push(`padRight={${pR}}`); }
        if (pT === pB && pT > 0) parts.push(`padY={${pT}}`);
        else { if (pT > 0) parts.push(`padTop={${pT}}`); if (pB > 0) parts.push(`padBottom={${pB}}`); }
        const isH = ff.layoutMode === "HORIZONTAL";
        const ax = figmaAlignToJsx(isH ? ff.primaryAxisAlignItems : ff.counterAxisAlignItems);
        const ay = figmaAlignToJsx(isH ? ff.counterAxisAlignItems : ff.primaryAxisAlignItems);
        if (ax !== "start") parts.push(`alignX="${ax}"`);
        if (ay !== "start") parts.push(`alignY="${ay}"`);
    }
    if ("opacity" in f && typeof (f as FrameNode).opacity === "number" && (f as FrameNode).opacity !== 1)
        parts.push(`opacity={${Math.round((f as FrameNode).opacity * 100) / 100}}`);
    if ("clipsContent" in f && (f as FrameNode).clipsContent) parts.push("clip");

    const childrenJsx = f.children.map(c => nodeToFullJsx(c, depth + 1)).filter(Boolean).join("\n");
    const propsStr = ` ${parts.join(" ")}`;
    if (!childrenJsx) return `${indent}<Frame${propsStr} />`;
    return `${indent}<Frame${propsStr}>\n${childrenJsx}\n${indent}</Frame>`;
}

// ── Snapshot serialization ─────────────────────────────────────

export function serializeNode(node: BaseNode): FigmaSnapshotNode | null
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

    if ("children" in node) {
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
    if (node.type === "FRAME") {
        if (isTopLevel) return "Screen";
        if (node.layoutMode === "VERTICAL") return "VStack";
        if (node.layoutMode === "HORIZONTAL") return "HStack";
        return "Frame";
    }
    return node.type;
}

export function snapshotNodeToJsx(node: FigmaSnapshotNode, depth: number, isTopLevel: boolean): string
{
    const indent = "  ".repeat(depth);
    const tag = nodeTag(node, isTopLevel);
    const props: string[] = [];

    if (node.name) props.push(`name="${node.name.replace(/"/g, "&quot;")}"`);
    if (node.width !== undefined && isTopLevel) props.push(`width="${Math.round(node.width)}"`);
    if (node.height !== undefined && isTopLevel) props.push(`height="${Math.round(node.height)}"`);

    if (node.type === "TEXT") {
        const text = escapeJsxText(node.text ?? "");
        return `${indent}<${tag}${props.length > 0 ? ` ${props.join(" ")}` : ""}>${text}</${tag}>`;
    }

    const children = node.children ?? [];
    if (children.length === 0)
        return `${indent}<${tag}${props.length > 0 ? ` ${props.join(" ")}` : ""} />`;

    const childJsx = children.map((child) => snapshotNodeToJsx(child, depth + 1, false)).join("\n");
    return `${indent}<${tag}${props.length > 0 ? ` ${props.join(" ")}` : ""}>\n${childJsx}\n${indent}</${tag}>`;
}

export function countSnapshotNodes(nodes: FigmaSnapshotNode[]): number
{
    return nodes.reduce((total, node) => total + 1 + countSnapshotNodes(node.children ?? []), 0);
}

export function buildPluginSnapshot(): FigmaPluginSnapshot
{
    const allRootNodes = [...figma.currentPage.children];
    const selectedNodes = figma.currentPage.selection.length > 0
        ? [...figma.currentPage.selection]
        : allRootNodes;

    const tree = selectedNodes
        .map((node) => serializeNode(node))
        .filter((node): node is FigmaSnapshotNode => node !== null);

    return {
        source: "plugin",
        receivedAt: Date.now(),
        nodeCount: countSnapshotNodes(tree),
        selectedNodeIds: figma.currentPage.selection.map((node) => getLogicalId(node.id)),
        tree,
        jsx: allRootNodes.map((node) => nodeToFullJsx(node, 0)).filter(Boolean).join("\n"),
        documentName: figma.root.name || undefined,
    };
}

// ── Variable management ────────────────────────────────────────

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
    if (color) {
        const modeId = collection.modes[0]?.modeId;
        if (modeId) variable.setValueForMode(modeId, color);
    }

    colorVariableCache.set(cacheKey, variable);
    return variable;
}

export async function ensureColorVariables(op: EnsureColorVariablesOp): Promise<void>
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

    for (const token of op.tokens) {
        let variable = byName.get(token.name);
        if (!variable) {
            variable = figma.variables.createVariable(token.name, collection, "COLOR");
            byName.set(token.name, variable);
        }
        const color = parseColor(token.hex);
        if (color) variable.setValueForMode(modeId, color);
        colorVariableCache.set(`${op.collection}::${token.name}`, variable);
    }
}

export async function ensureThemeVariables(op: EnsureThemeVariablesOp): Promise<void>
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

    for (const token of op.tokens) {
        let variable = byName.get(token.variableName);
        if (!variable) {
            variable = figma.variables.createVariable(token.variableName, collection, "COLOR");
            byName.set(token.variableName, variable);
        }
        const color = parseColor(token.hex);
        if (color) variable.setValueForMode(modeId, color);
        colorVariableCache.set(`${op.collection}::${token.variableName}`, variable);
    }
}

// ── Paint & layout helpers ─────────────────────────────────────

export async function solidPaint(input: ColorInput): Promise<SolidPaint | null>
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

export function resolveParent(frameId: unknown): FrameNode | PageNode
{
    if (typeof frameId === "string") {
        const figmaId = nodeMap.get(frameId);
        if (figmaId) {
            const node = figma.getNodeById(figmaId);
            if (node && node.type === "FRAME") return node as FrameNode;
        }
        // Fallback: search top-level page children by name (handles stale/empty nodeMap)
        const byName = figma.currentPage.children.find(
            n => n.name === frameId && n.type === "FRAME",
        ) as FrameNode | undefined;
        if (byName) {
            nodeMap.set(frameId, byName.id);
            return byName;
        }
    }
    return figma.currentPage;
}

export function angleToGradientTransform(angleDeg: number): [[number, number, number], [number, number, number]]
{
    const rad = (angleDeg * Math.PI) / 180;
    const s = Math.sin(rad);
    const c = Math.cos(rad);
    return [
        [s, -c, 0.5 - s / 2],
        [c,  s, 0.5 - c / 2],
    ];
}

export function resolveNode(nodeId: unknown, map?: Map<string, string>): BaseNode | null
{
    if (typeof nodeId !== "string") return null;
    const effectiveMap = map ?? nodeMap;
    const figmaId = effectiveMap.get(nodeId);
    return figmaId ? figma.getNodeById(figmaId) : null;
}

export function applyLayoutSizing(node: SceneNode, op: FigmaOp): void
{
    if (op.fillParent && "layoutSizingHorizontal" in node)
        (node as SceneNode & { layoutSizingHorizontal: "FIXED" | "HUG" | "FILL" }).layoutSizingHorizontal = "FILL";
    if (op.fillParentHeight && "layoutSizingVertical" in node)
        (node as SceneNode & { layoutSizingVertical: "FIXED" | "HUG" | "FILL" }).layoutSizingVertical = "FILL";
    if (op.ignoreAutoLayout && "layoutPositioning" in node)
        (node as SceneNode & { layoutPositioning: "AUTO" | "ABSOLUTE" }).layoutPositioning = "ABSOLUTE";
}

export function applyCornerRadii(node: SceneNode, op: FigmaOp): void
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
