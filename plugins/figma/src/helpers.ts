import type { FigmaOp, RGBA, ColorInput, VariableColorValue, EnsureColorVariablesOp, EnsureThemeVariablesOp, EnsureTokenVariablesOp, EnsureTextStylesOp, FigmaSnapshotNode, FigmaPluginSnapshot } from "./types";
import { nodeMap, collectionCache, colorVariableCache, numberVariableCache, themeCollectionRef, textStyleCache } from "./cache";
import { dlog, derr, describeNode } from "./debug";

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

/** Strip `theme/` from a color variable name to get the bare token key. */
function colorVarKey(variableName: string): string
{
    return variableName.startsWith("theme/") ? variableName.slice(6) : variableName;
}

/** Strip `spacing/` or `radius/` from a number variable name. */
function numberVarKey(variableName: string): string
{
    const slash = variableName.indexOf("/");
    return slash >= 0 ? variableName.slice(slash + 1) : variableName;
}

/**
 * If the first solid paint is bound to a COLOR variable, return its bare token
 * key (e.g. "primary"). Otherwise undefined and caller falls back to hex.
 */
export function getPrimaryColorTokenKey(paints: ReadonlyArray<Paint> | typeof figma.mixed): string | undefined
{
    if (paints === figma.mixed || !Array.isArray(paints)) return undefined;
    const solid = (paints as Paint[]).find((p): p is SolidPaint => p.type === "SOLID" && p.visible !== false);
    if (!solid) return undefined;
    const bound = (solid as SolidPaint & { boundVariables?: { color?: VariableAlias } }).boundVariables?.color;
    if (!bound) return undefined;
    const v = figma.variables.getVariableById(bound.id);
    if (!v) return undefined;
    return colorVarKey(v.name);
}

/**
 * If a node's numeric field is bound to a FLOAT variable, return its bare key
 * (e.g. "md"). Otherwise undefined.
 */
export function getNumberFieldTokenKey(
    node: BaseNode,
    field: string,
): string | undefined
{
    const bv = (node as BaseNode & { boundVariables?: Record<string, VariableAlias | undefined> }).boundVariables;
    const alias = bv?.[field];
    if (!alias) return undefined;
    const v = figma.variables.getVariableById(alias.id);
    if (!v) return undefined;
    return numberVarKey(v.name);
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
        const fillTok = getPrimaryColorTokenKey(tn.fills);
        if (fillTok) parts.push(`fill="${fillTok}"`);
        else { const fc = getPrimaryColor(tn.fills); if (fc) parts.push(`fill="${fc}"`); }

        // If this text node has a typography style bound, emit `variant="…"`
        // and skip raw fontSize/fontWeight (the style covers them).
        let variantEmitted = false;
        const styleId = (tn as TextNode & { textStyleId?: string | typeof figma.mixed }).textStyleId;
        if (typeof styleId === "string" && styleId !== "")
        {
            const style = figma.getStyleById(styleId);
            if (style && style.type === "TEXT" && style.name)
            {
                parts.push(`variant="${style.name}"`);
                variantEmitted = true;
            }
        }

        if (!variantEmitted)
        {
            if (tn.fontSize !== figma.mixed) parts.push(`fontSize={${tn.fontSize as number}}`);
            if (tn.fontName !== figma.mixed) {
                const fw = fontWeightFromStyle((tn.fontName as FontName).style);
                if (fw !== "regular") parts.push(`fontWeight="${fw}"`);
            }
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
        const fillTok = getPrimaryColorTokenKey(el.fills);
        if (fillTok) parts.push(`fill="${fillTok}"`);
        else { const fc = getPrimaryColor(el.fills); if (fc) parts.push(`fill="${fc}"`); }
        const strokeTok = getPrimaryColorTokenKey(el.strokes);
        const sc = strokeTok ?? getPrimaryColor(el.strokes);
        if (sc) { parts.push(`stroke="${sc}"`); if (typeof el.strokeWeight === "number" && el.strokeWeight !== 1) parts.push(`strokeWidth={${el.strokeWeight}}`); }
        return `${indent}<Ellipse ${parts.join(" ")} />`;
    }

    if (t === "LINE") {
        const ln = node as LineNode;
        const parts = [`name="${ln.name.replace(/"/g, "&quot;")}"`, `length={${Math.round(Math.max(ln.width, ln.height))}}`];
        if (ln.height > ln.width) parts.push("vertical");
        const strokeTok = getPrimaryColorTokenKey(ln.strokes);
        const sc = strokeTok ?? getPrimaryColor(ln.strokes);
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
        if (typeof rect.cornerRadius === "number" && rect.cornerRadius > 0)
        {
            const radTok = getNumberFieldTokenKey(rect, "topLeftRadius");
            parts.push(radTok ? `radius="${radTok}"` : `radius={${rect.cornerRadius}}`);
        }
        if (imgFill) {
            // Prefer the original URL stored as pluginData by create-image.
            // imageHash is a Figma-internal id and round-tripping it back
            // through the LLM would just confuse it.
            const stored = rect.getPluginData("imgSrc");
            const srcStr = stored || imgFill.imageHash || "image";
            parts.push(`src="${srcStr.replace(/"/g, "&quot;")}"`);
            return `${indent}<Image ${parts.join(" ")} />`;
        }
        const fillTok = getPrimaryColorTokenKey(fills);
        if (fillTok) parts.push(`fill="${fillTok}"`);
        else { const fc = getPrimaryColor(fills); if (fc) parts.push(`fill="${fc}"`); }
        return `${indent}<Rect ${parts.join(" ")} />`;
    }

    if (!("children" in node)) return "";

    const f = node as FrameNode;

    // SVG-icon round-trip. createNodeFromSvg returns a Frame whose vector
    // children we cannot serialize back into our 6-component JSX. Instead
    // of leaking that internal structure (or losing it entirely on edits),
    // we tag the wrapper Frame with svgSrc on creation and replay it as
    // `<Image src="…" />` here.
    const svgSrc = f.getPluginData ? f.getPluginData("svgSrc") : "";
    if (svgSrc)
    {
        const iconParts: string[] = [`name="${f.name.replace(/"/g, "&quot;")}"`];
        if (f.width  > 0) iconParts.push(`width={${Math.round(f.width)}}`);
        if (f.height > 0) iconParts.push(`height={${Math.round(f.height)}}`);
        iconParts.push(`src="${svgSrc.replace(/"/g, "&quot;")}"`);
        return `${indent}<Image ${iconParts.join(" ")} />`;
    }

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
    if ("fills" in f) {
        const fillTok = getPrimaryColorTokenKey((f as FrameNode).fills);
        if (fillTok) parts.push(`fill="${fillTok}"`);
        else { const fc = getPrimaryColor((f as FrameNode).fills); if (fc) parts.push(`fill="${fc}"`); }
    }
    if ("strokes" in f) {
        const strokeTok = getPrimaryColorTokenKey((f as FrameNode).strokes);
        const sc = strokeTok ?? getPrimaryColor((f as FrameNode).strokes);
        if (sc) {
            parts.push(`stroke="${sc}"`);
            const sw = (f as FrameNode).strokeWeight;
            if (typeof sw === "number" && sw > 0) parts.push(`strokeWidth={${sw}}`);
        }
    }
    if ("cornerRadius" in f) {
        const cr = (f as FrameNode).cornerRadius;
        if (cr !== figma.mixed && typeof cr === "number" && cr > 0)
        {
            const radTok = getNumberFieldTokenKey(f, "topLeftRadius");
            parts.push(radTok ? `radius="${radTok}"` : `radius={${cr}}`);
        }
    }
    if (isAL) {
        const ff = f as FrameNode;
        if (ff.itemSpacing > 0)
        {
            const gapTok = getNumberFieldTokenKey(ff, "itemSpacing");
            parts.push(gapTok ? `gap="${gapTok}"` : `gap={${ff.itemSpacing}}`);
        }
        const pL = ff.paddingLeft ?? 0, pR = ff.paddingRight ?? 0;
        const pT = ff.paddingTop  ?? 0, pB = ff.paddingBottom ?? 0;
        const pLTok = getNumberFieldTokenKey(ff, "paddingLeft");
        const pRTok = getNumberFieldTokenKey(ff, "paddingRight");
        const pTTok = getNumberFieldTokenKey(ff, "paddingTop");
        const pBTok = getNumberFieldTokenKey(ff, "paddingBottom");
        if (pL === pR && pLTok && pLTok === pRTok) parts.push(`padX="${pLTok}"`);
        else if (pL === pR && pL > 0) parts.push(`padX={${pL}}`);
        else { if (pL > 0) parts.push(pLTok ? `padLeft="${pLTok}"` : `padLeft={${pL}}`); if (pR > 0) parts.push(pRTok ? `padRight="${pRTok}"` : `padRight={${pR}}`); }
        if (pT === pB && pTTok && pTTok === pBTok) parts.push(`padY="${pTTok}"`);
        else if (pT === pB && pT > 0) parts.push(`padY={${pT}}`);
        else { if (pT > 0) parts.push(pTTok ? `padTop="${pTTok}"` : `padTop={${pT}}`); if (pB > 0) parts.push(pBTok ? `padBottom="${pBTok}"` : `padBottom={${pB}}`); }
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

// ─── Typography text-styles ────────────────────────────────────

const FONT_WEIGHT_MAP: Record<string, string> = {
    bold: "Bold", semibold: "Semi Bold", "semi bold": "Semi Bold", "semi-bold": "Semi Bold",
    medium: "Medium", regular: "Regular", normal: "Regular", light: "Light",
    "700": "Bold", "600": "Semi Bold", "500": "Medium", "400": "Regular", "300": "Light",
};

function normalizeFontStyle(weight: string | undefined): string
{
    if (!weight) return "Regular";
    return FONT_WEIGHT_MAP[String(weight).toLowerCase().trim()] ?? "Regular";
}

/**
 * Create or update a figma TextStyle for each typography token. The plugin
 * caches the resulting TextStyle keyed by the token name; create_text
 * consumes that cache to bind nodes via `text.textStyleId`.
 */
export async function ensureTextStyles(op: EnsureTextStylesOp): Promise<void>
{
    const localStyles = await figma.getLocalTextStylesAsync();
    const byName = new Map<string, TextStyle>(localStyles.map((s) => [s.name, s] as const));

    for (const s of op.styles)
    {
        const family = s.fontFamily ?? "Inter";
        const style = normalizeFontStyle(s.fontWeight);
        try { await figma.loadFontAsync({ family, style }); }
        catch (err)
        {
            derr("ensure_text_styles", `loadFontAsync({${family}, ${style}}) failed for "${s.name}": ${err instanceof Error ? err.message : String(err)} — skipping`);
            continue;
        }

        let ts = byName.get(s.name);
        if (!ts)
        {
            ts = figma.createTextStyle();
            ts.name = s.name;
            byName.set(s.name, ts);
        }
        ts.fontName = { family, style };
        if (s.fontSize !== undefined) ts.fontSize = s.fontSize;
        if (s.lineHeight !== undefined) ts.lineHeight = { value: s.lineHeight, unit: "PIXELS" };
        if (s.letterSpacing !== undefined) ts.letterSpacing = { value: s.letterSpacing, unit: "PIXELS" };
        textStyleCache.set(s.name, ts);
    }

    dlog("ensure_text_styles", `synced ${op.styles.length} text styles: ${op.styles.map(s => s.name).join(", ")}`);
}

/** Look up a previously-ensured TextStyle by its name. */
export async function findTextStyleByName(name: string): Promise<TextStyle | null>
{
    const cached = textStyleCache.get(name);
    if (cached) return cached;
    const styles = await figma.getLocalTextStylesAsync();
    const found = styles.find((s) => s.name === name);
    if (found) textStyleCache.set(name, found);
    return found ?? null;
}

// Scopes restrict where a variable shows up in Figma's UI when binding.
// More importantly, an empty / wrong scope can prevent setBoundVariable
// from taking effect on certain fields, so we set them explicitly.
function scopesForKind(kind: "color" | "spacing" | "radius"): VariableScope[]
{
    if (kind === "color")   return ["ALL_FILLS", "STROKE_COLOR"];
    if (kind === "radius")  return ["CORNER_RADIUS"];
    // spacing covers gap + padding (which Figma treats as GAP scope) and
    // can also be used for stroke weight in some designs.
    return ["GAP", "WIDTH_HEIGHT", "STROKE_FLOAT"];
}

/**
 * Unified token-variables ensure op. Creates/updates COLOR variables for
 * `kind=color` tokens and FLOAT variables for `kind=spacing|radius`. Used
 * once per batch (emitted as the first op by the server compiler).
 */
export async function ensureTokenVariables(op: EnsureTokenVariablesOp): Promise<void>
{
    themeCollectionRef.collection = op.collection;
    themeCollectionRef.mode = op.mode;

    const collection = await getOrCreateCollection(op.collection);
    const modeId = collection.modes[0]?.modeId;
    if (!modeId) return;

    const colorVars = await figma.variables.getLocalVariablesAsync("COLOR");
    const floatVars = await figma.variables.getLocalVariablesAsync("FLOAT");
    const colorByName = new Map(colorVars
        .filter((v) => v.variableCollectionId === collection.id)
        .map((v) => [v.name, v] as const));
    const floatByName = new Map(floatVars
        .filter((v) => v.variableCollectionId === collection.id)
        .map((v) => [v.name, v] as const));

    for (const t of op.tokens)
    {
        if (t.kind === "color")
        {
            let variable = colorByName.get(t.variableName);
            if (!variable)
            {
                variable = figma.variables.createVariable(t.variableName, collection, "COLOR");
                colorByName.set(t.variableName, variable);
            }
            const c = parseColor(t.value);
            if (c) variable.setValueForMode(modeId, c);
            try { variable.scopes = scopesForKind("color"); } catch { /* ignore */ }
            colorVariableCache.set(`${op.collection}::${t.variableName}`, variable);
        }
        else
        {
            let variable = floatByName.get(t.variableName);
            if (!variable)
            {
                variable = figma.variables.createVariable(t.variableName, collection, "FLOAT");
                floatByName.set(t.variableName, variable);
            }
            const n = Number(t.value);
            if (Number.isFinite(n)) variable.setValueForMode(modeId, n);
            try { variable.scopes = scopesForKind(t.kind); } catch { /* ignore */ }
            numberVariableCache.set(`${op.collection}::${t.variableName}`, variable);
        }
    }

    dlog("ensure_token_variables", `synced ${op.tokens.length} variables in "${op.collection}" (mode=${op.mode})`);
}

/** Look up a previously-ensured COLOR variable by its name (e.g. "theme/primary"). */
export async function findColorVariableByName(variableName: string): Promise<Variable | null>
{
    const cacheKey = `${themeCollectionRef.collection}::${variableName}`;
    const cached = colorVariableCache.get(cacheKey);
    if (cached) return cached;

    const collection = await getOrCreateCollection(themeCollectionRef.collection);
    const variables = await figma.variables.getLocalVariablesAsync("COLOR");
    const found = variables.find((v) =>
        v.variableCollectionId === collection.id && v.name === variableName);
    if (found) colorVariableCache.set(cacheKey, found);
    return found ?? null;
}

/** Look up a previously-ensured FLOAT variable by its name (e.g. "spacing/md"). */
export async function findNumberVariableByName(variableName: string): Promise<Variable | null>
{
    const cacheKey = `${themeCollectionRef.collection}::${variableName}`;
    const cached = numberVariableCache.get(cacheKey);
    if (cached) return cached;

    const collection = await getOrCreateCollection(themeCollectionRef.collection);
    const variables = await figma.variables.getLocalVariablesAsync("FLOAT");
    const found = variables.find((v) =>
        v.variableCollectionId === collection.id && v.name === variableName);
    if (found) numberVariableCache.set(cacheKey, found);
    return found ?? null;
}

/**
 * Bind a FLOAT variable to a node's numeric property. After the call, we
 * read back `node.boundVariables[field]` to confirm the binding actually
 * stuck — figma's setBoundVariable can silently no-op when scopes / types
 * don't match, so verifying is the only way to know.
 */
export async function bindNumberVariable(
    node: SceneNode,
    field: string,
    variableName: string | undefined,
    tag: string,
): Promise<void>
{
    if (!variableName) return;
    const v = await findNumberVariableByName(variableName);
    if (!v)
    {
        derr(tag, `bind ${field}: variable "${variableName}" not found in collection "${themeCollectionRef.collection}"`);
        return;
    }
    try
    {
        const target = node as SceneNode & {
            setBoundVariable?: (field: string, variable: Variable) => void;
        };
        target.setBoundVariable?.(field as never, v);

        // Verify it took. boundVariables[field] should now be a VariableAlias
        // pointing at v.id. If empty after set, the API silently rejected us.
        const after = (node as SceneNode & { boundVariables?: Record<string, VariableAlias | undefined> }).boundVariables;
        const alias = after?.[field];
        if (alias && alias.id === v.id)
        {
            dlog(tag, `bound ${field} → "${variableName}" (id=${v.id}) on ${node.type}#${node.id}`);
        }
        else
        {
            derr(tag, `❌ bound ${field}="${variableName}" did NOT take effect on ${node.type}#${node.id}/"${node.name}". boundVariables[${field}]=${alias ? alias.id : "empty"}. Check variable scopes / field validity.`);
        }
    }
    catch (err)
    {
        derr(tag, `bind ${field}=${variableName} failed: ${err instanceof Error ? err.message : String(err)}`);
    }
}

/**
 * Build a SolidPaint with optional COLOR variable binding. Caller writes
 * `node.fills = [paint]`.
 */
export async function solidPaintWithBinding(hex: string, variableName: string | undefined): Promise<SolidPaint | null>
{
    const p = parseColor(hex);
    if (!p) return null;
    const paint: SolidPaint = {
        type: "SOLID",
        color: { r: p.r, g: p.g, b: p.b },
        visible: true,
        blendMode: "NORMAL",
        opacity: p.a,
    };
    if (!variableName) return paint;
    const variable = await findColorVariableByName(variableName);
    if (!variable) return paint;
    return figma.variables.setBoundVariableForPaint(paint, "color", variable);
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

// Any node type that can legitimately host children we create. FRAME and
// COMPONENT both serve as auto-layout containers; COMPONENT_SET hosts
// COMPONENT children. PAGE is the canvas-level fallback.
type ParentLike = FrameNode | ComponentNode | ComponentSetNode | PageNode;

function isParentLike(node: BaseNode | null): node is ParentLike
{
    if (!node) return false;
    return node.type === "FRAME" || node.type === "COMPONENT" || node.type === "COMPONENT_SET" || node.type === "PAGE";
}

export function resolveParent(frameId: unknown): ParentLike
{
    if (typeof frameId !== "string")
    {
        dlog("resolveParent", `frameId not a string (=${String(frameId)}), → currentPage`);
        return figma.currentPage;
    }

    const figmaId = nodeMap.get(frameId);
    if (figmaId)
    {
        const node = figma.getNodeById(figmaId);
        if (isParentLike(node))
        {
            dlog("resolveParent", `"${frameId}" → nodeMap hit → ${describeNode(node)}`);
            return node;
        }
        dlog("resolveParent", `"${frameId}" → nodeMap had id="${figmaId}" but getNodeById=${node ? `type=${node.type}` : "null"} (stale)`);
    }
    else
    {
        dlog("resolveParent", `"${frameId}" → no nodeMap entry`);
    }

    // Fallback: search top-level page children by name (handles stale/empty nodeMap)
    const byName = figma.currentPage.children.find(
        n => n.name === frameId && (n.type === "FRAME" || n.type === "COMPONENT" || n.type === "COMPONENT_SET"),
    ) as FrameNode | ComponentNode | ComponentSetNode | undefined;
    if (byName)
    {
        nodeMap.set(frameId, byName.id);
        dlog("resolveParent", `"${frameId}" → page-child name match → ${describeNode(byName)}`);
        return byName;
    }

    derr("resolveParent", `❌ "${frameId}" UNRESOLVED, falling back to currentPage. Children of new node will be parented to the page (NOT auto-layout) and layoutSizing ops will fail.`);
    return figma.currentPage;
}

// UI Kit page management. Components live on a dedicated page so Figma's
// Assets panel indexes them and they don't pollute the design canvas.
const UI_KIT_PAGE_NAME = "🧩 UI Kit";

export async function ensureUiKitPage(): Promise<PageNode>
{
    await figma.loadAllPagesAsync();
    const existing = figma.root.children.find(
        (p) => p.type === "PAGE" && p.name === UI_KIT_PAGE_NAME,
    ) as PageNode | undefined;
    if (existing) return existing;

    const page = figma.createPage();
    page.name = UI_KIT_PAGE_NAME;
    return page;
}

// Composite key for variant lookup. Sorted alphabetically by axis name so
// `{state:"hover",size:"md"}` and `{size:"md",state:"hover"}` produce the
// same string. Format: "size=md,state=hover".
export function variantKey(variants: Record<string, string> | undefined): string
{
    if (!variants) return "";
    const entries = Object.entries(variants);
    if (entries.length === 0) return "";
    return entries
        .map(([k, v]) => [k, v] as const)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([k, v]) => `${k}=${v}`)
        .join(",");
}

// Composite registry key: "Button" or "Button/state=hover,size=md".
export function componentRegistryKey(name: string, variants?: Record<string, string>): string
{
    const vk = variantKey(variants);
    return vk ? `${name}/${vk}` : name;
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
    if (typeof nodeId !== "string")
    {
        dlog("resolveNode", `nodeId not a string (=${String(nodeId)}), → null`);
        return null;
    }
    const effectiveMap = map ?? nodeMap;
    const figmaId = effectiveMap.get(nodeId);
    if (!figmaId)
    {
        dlog("resolveNode", `"${nodeId}" → no nodeMap entry, → null`);
        return null;
    }
    const node = figma.getNodeById(figmaId);
    if (!node)
    {
        dlog("resolveNode", `"${nodeId}" → nodeMap had id="${figmaId}" but getNodeById=null (stale)`);
        return null;
    }
    return node;
}

// When a create_* handler reused a node by nodeMap id, that node's actual
// figma parent may not match where this op wants it (e.g. orphan from a
// prior batch on the page root). Re-parent if needed so the rest of the
// op's setup (layout sizing, etc.) works against the right ancestor.
export function ensureCorrectParent(node: SceneNode, frameId: unknown, tag: string): void
{
    const desired = resolveParent(frameId);
    if (node.parent !== desired)
    {
        const oldParent = node.parent ? `${node.parent.type}#${node.parent.id}/"${(node.parent as BaseNode & { name?: string }).name ?? "?"}"` : "null";
        const newParent = `${desired.type}#${desired.id}/"${(desired as BaseNode & { name?: string }).name ?? "?"}"`;
        try
        {
            (desired as FrameNode | PageNode).appendChild(node);
            derr(tag, `re-parented ${describeNode(node)} from ${oldParent} → ${newParent} (REUSE found node at wrong parent)`);
        }
        catch (err)
        {
            derr(tag, `❌ failed to re-parent ${describeNode(node)} (was at ${oldParent}, wanted ${newParent}): ${err instanceof Error ? err.message : String(err)}`);
        }
    }
}

export function applyLayoutSizing(node: SceneNode, op: FigmaOp): void
{
    let canFill = true;
    if (op.fillParent || op.fillParentHeight)
    {
        const parent = "parent" in node ? (node as SceneNode & { parent: BaseNode | null }).parent : null;
        const parentLM = parent && "layoutMode" in parent
            ? (parent as BaseNode & { layoutMode: string }).layoutMode
            : "n/a";
        canFill = parentLM === "HORIZONTAL" || parentLM === "VERTICAL";

        if (!canFill)
        {
            // Skip the FILL setting instead of throwing. Throwing on a single
            // node cascades into Figma reporting the whole op as failed and
            // the user sees a wall of failures. We log loudly and apply
            // best-effort (default FIXED), so subsequent ops in the same
            // subtree can still create their nodes.
            derr("applyLayoutSizing",
                `❌ skipping FILL on ${describeNode(node)} — parent ${describeNode(parent)} is NOT auto-layout (layoutMode=${parentLM}). Node will stay FIXED.`,
                `op.fillParent=${op.fillParent ?? false} op.fillParentHeight=${op.fillParentHeight ?? false}`);
        }
        else
        {
            dlog("applyLayoutSizing",
                `setting FILL on ${describeNode(node)} (parent layoutMode=${parentLM}) fillParent=${op.fillParent ?? false} fillParentHeight=${op.fillParentHeight ?? false}`);
        }
    }

    if (canFill && op.fillParent && "layoutSizingHorizontal" in node)
        (node as SceneNode & { layoutSizingHorizontal: "FIXED" | "HUG" | "FILL" }).layoutSizingHorizontal = "FILL";
    if (canFill && op.fillParentHeight && "layoutSizingVertical" in node)
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
