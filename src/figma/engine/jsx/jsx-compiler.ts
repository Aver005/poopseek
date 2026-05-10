import { createEnsureTokenVariablesOp, createEnsureTextStylesOp } from "../theme/theme-state";
import {
    resolveColor, resolveNumber, colorFields, numberFields,
    resolveVariant, resolveAs, componentBundleToProps,
} from "./token-resolver";
import type { JsxNode, JsxPropValue } from "./jsx-parser";
import { COMPONENT_SPECS } from "./jsx-spec";
import type { FigmaOp } from "../../types";

// Build the union of all known frame-style props once. When collecting
// variant axes off a `<Component>` we need to exclude these — otherwise
// `fill="primary"` on a Component master ends up as a variant axis
// "fill=primary" and the registry key becomes nonsense.
const KNOWN_FRAME_AND_TEXT_PROPS = new Set<string>([
    ...COMPONENT_SPECS.Frame!.allowedProps,
    ...COMPONENT_SPECS.Text!.allowedProps,
]);

/**
 * Apply `as="..."` component bundle onto node.props as defaults — so any
 * prop the model wrote explicitly still wins. Mutates node.props in place.
 * Called at the start of each compile* function.
 */
function applyComponentAs(node: JsxNode): void
{
    const asRef = node.props.as;
    if (asRef === undefined) return;
    const bundle = resolveAs(asRef);
    if (!bundle) return;
    const expanded = componentBundleToProps(bundle, node.type);
    for (const [k, v] of Object.entries(expanded))
    {
        if (node.props[k] === undefined) node.props[k] = v as JsxPropValue;
    }
    delete node.props.as;
}

type SizeMode = number | "fill" | "hug";

interface FrameContext
{
    id: string;
    width: number;
    height: number;
    isAutoLayout: boolean;
    flow: "HORIZONTAL" | "VERTICAL";
    /** When this stack frame represents a `<ComponentSet name="X">`, child
     *  `<Component>` nodes without their own `name=` inherit "X" from here.
     *  Otherwise registry collisions: every `<Component state="default">`
     *  inside any ComponentSet gets the SAME default name "Component" and
     *  collides under "Component/state=default". */
    componentSetName?: string;
}

interface State
{
    ops: FigmaOp[];
    counter: number;
    stack: FrameContext[];
}

type Props = Record<string, JsxPropValue>;

const SHADOW_PRESETS: Record<string, Record<string, unknown>> = {
    card:   { color: "#000000", x: 0, y: 2,  blur: 12, spread: 0, opacity: 0.08 },
    modal:  { color: "#000000", x: 0, y: 8,  blur: 32, spread: 0, opacity: 0.12 },
    button: { color: "#2563EB", x: 0, y: 4,  blur: 12, spread: 0, opacity: 0.30 },
};

function uid(state: State, prefix: string): string
{
    return `${prefix}_${state.counter++}`;
}

function top(state: State): FrameContext | undefined
{
    return state.stack.at(-1);
}

function push(state: State, op: FigmaOp): void
{
    state.ops.push(op);
}

function str(value: JsxPropValue | undefined): string | undefined
{
    return value === undefined ? undefined : String(value);
}

function num(value: JsxPropValue | undefined): number | undefined
{
    if (value === undefined) return undefined;
    const n = Number(value);
    return Number.isNaN(n) ? undefined : n;
}

function resolveSize(value: JsxPropValue | undefined): SizeMode | undefined
{
    if (value === undefined) return undefined;
    if (value === "fill" || value === "hug") return value;
    const n = num(value);
    return n !== undefined ? n : undefined;
}

// "fill" is only valid in an auto-layout parent; otherwise collapse to the parent's concrete dimension
function resolveFill(sz: SizeMode | undefined, parentIsAL: boolean, parentDim: number): SizeMode | undefined
{
    if (!parentIsAL && sz === "fill") return parentDim || sz;
    return sz;
}

function textContent(node: JsxNode): string
{
    let result = "";
    for (const child of node.children)
    {
        if (typeof child === "string")
            result += child;
        else if (child.type === "Text")
            result += textContent(child);
    }
    return result.trim();
}

function parentRef(state: State, props: Props): { frameId?: string }
{
    const parent = top(state);
    return parent && !props.detach ? { frameId: parent.id } : {};
}

function applyShadow(state: State, nodeId: string, value: JsxPropValue | undefined): void
{
    const key = str(value);
    if (!key || key === "none") return;
    const preset = SHADOW_PRESETS[key];
    if (!preset) return;
    push(state, { type: "set_shadow", nodeId, ...preset });
}

// Parse the `border=` shortcut into stroke + width. Accepts:
//   border={1}                   → { stroke: "border", width: 1 }
//   border                       → { stroke: "border", width: 1 }   (boolean true)
//   border="primary"             → { stroke: "primary", width: 1 }
//   border="2"                   → { stroke: "border", width: 2 }
//   border="1 primary"           → { stroke: "primary", width: 1 }
//   border="1px solid primary"   → { stroke: "primary", width: 1 }   (CSS-like)
function parseBorder(value: JsxPropValue | undefined): { stroke: string; width: number } | undefined
{
    if (value === undefined) return undefined;
    if (value === true) return { stroke: "border", width: 1 };
    if (value === false) return undefined;
    if (typeof value === "number") return { stroke: "border", width: value };
    if (typeof value !== "string") return undefined;

    const trimmed = value.trim();
    if (!trimmed) return undefined;

    let width = 1;
    let color: string | undefined;
    for (const part of trimmed.split(/\s+/))
    {
        const numMatch = /^(\d+(?:\.\d+)?)(?:px)?$/.exec(part);
        if (numMatch) { width = Number(numMatch[1]); continue; }
        if (part === "solid" || part === "dashed" || part === "dotted" || part === "none") continue;
        if (!color) color = part;     // first non-numeric, non-style token wins
    }
    return { stroke: color ?? "border", width };
}

// Resolve effective stroke + weight by combining `border` shortcut and the
// explicit `stroke=` / `strokeWidth=` props. Explicit props win over the
// shortcut when both are present.
function resolveBorderProps(
    border: JsxPropValue | undefined,
    stroke: JsxPropValue | undefined,
    strokeWidth: JsxPropValue | undefined,
): { color: JsxPropValue | undefined; weight: JsxPropValue | undefined }
{
    const parsed = parseBorder(border);
    if (!parsed) return { color: stroke, weight: strokeWidth };
    return {
        color: stroke !== undefined ? stroke : parsed.stroke,
        weight: strokeWidth !== undefined ? strokeWidth : parsed.width,
    };
}

function applyStroke(state: State, nodeId: string, color: JsxPropValue | undefined, weight: JsxPropValue | undefined): void
{
    const resolved = resolveColor(color);
    if (!resolved) return;
    push(state, {
        type: "set_stroke",
        nodeId,
        color: resolved.hex,
        ...(resolved.variableName ? { colorVariableName: resolved.variableName } : {}),
        weight: num(weight) ?? 1,
        align: "INSIDE",
    });
}

function applyGradient(state: State, nodeId: string, value: JsxPropValue | undefined): void
{
    const gradient = str(value);
    if (!gradient) return;
    const parts = gradient.split(":");
    if (parts.length === 3)
    {
        const [from, to, angle] = parts;
        push(state, { type: "set_gradient", nodeId, from, to, angle: Number(angle ?? "0") });
    }
    else if (parts.length === 4)
    {
        const [from, via, to, angle] = parts;
        push(state, { type: "set_gradient_three", nodeId, from, via, to, angle: Number(angle ?? "0") });
    }
}

function applyOpacity(state: State, nodeId: string, value: JsxPropValue | undefined): void
{
    const resolved = num(value);
    if (resolved === undefined) return;
    push(state, { type: "set_opacity", nodeId, opacity: resolved });
}

function isHexColor(s: string): boolean
{
    return /^#[0-9a-fA-F]{3,8}$/.test(s);
}

// Parses "x:y:blur[:spread]:color:opacity" → shadow object, or null if invalid/non-hex color
function parseShadow(part: string): Record<string, unknown> | null
{
    const segs = part.trim().split(":");
    if (segs.length === 5)
    {
        const [x, y, blur, color, opacity] = segs;
        if (!color || !isHexColor(color)) return null;
        return { x: Number(x), y: Number(y), blur: Number(blur), spread: 0, color, opacity: Number(opacity) };
    }
    if (segs.length === 6)
    {
        const [x, y, blur, spread, color, opacity] = segs;
        if (!color || !isHexColor(color)) return null;
        return { x: Number(x), y: Number(y), blur: Number(blur), spread: Number(spread), color, opacity: Number(opacity) };
    }
    return null;
}

function applyDropShadow(state: State, nodeId: string, value: JsxPropValue | undefined): void
{
    const raw = str(value);
    if (!raw) return;
    for (const part of raw.split(";"))
    {
        const s = parseShadow(part);
        if (s) push(state, { type: "set_shadow", nodeId, shadowType: "DROP_SHADOW", ...s });
    }
}

function applyInnerShadow(state: State, nodeId: string, value: JsxPropValue | undefined): void
{
    const raw = str(value);
    if (!raw) return;
    for (const part of raw.split(";"))
    {
        const s = parseShadow(part);
        if (s) push(state, { type: "set_shadow", nodeId, shadowType: "INNER_SHADOW", ...s });
    }
}

// "start"/"left"/"top" → "MIN", "center"/"middle" → "CENTER", "end"/"right"/"bottom" → "MAX", "between" → "SPACE_BETWEEN"
function toFigmaAlign(val: string | undefined, allowBetween: boolean): string | undefined
{
    if (!val) return undefined;
    switch (val.toLowerCase())
    {
        case "start": case "left": case "top": return "MIN";
        case "center": case "middle": return "CENTER";
        case "end": case "right": case "bottom": return "MAX";
        case "between": return allowBetween ? "SPACE_BETWEEN" : undefined;
        default: return val.toUpperCase();
    }
}

function compileFrame(node: JsxNode, state: State, opType: string = "create_frame"): void
{
    applyComponentAs(node);
    const p = node.props;
    const parent = top(state);
    const isComponent = opType === "create_component" || opType === "create_component_set";
    const idPrefix = opType === "create_component" ? "cmp"
        : opType === "create_component_set" ? "cset"
        : "frm";
    const id = str(p.id) ?? uid(state, idPrefix);

    const hasLayoutProps = p.padX !== undefined || p.padY !== undefined
        || p.padTop !== undefined || p.padRight !== undefined
        || p.padBottom !== undefined || p.padLeft !== undefined
        || p.gap !== undefined || p.alignX !== undefined || p.alignY !== undefined;

    // Inference: a Frame with any child requesting `width/height="fill"`
    // OR with 2+ element children physically NEEDS auto-layout — otherwise
    // children pile up at (0,0) (Figma renders fixed positioning by default
    // when layoutMode=NONE, and `width="fill"` becomes a no-op since there's
    // no main axis to fill). LLMs frequently forget the explicit
    // `autoLayout flow="vertical"` on the root, producing pages where every
    // section overlaps. Detect and force auto-layout here.
    const elementChildren = node.children.filter((c) => typeof c === "object") as JsxNode[];
    const hasFillChildren = elementChildren.some((c) =>
    {
        const cp = c.props;
        return cp.width === "fill" || cp.height === "fill" || cp.w === "fill" || cp.h === "fill";
    });
    const inferAutoLayout = hasFillChildren || elementChildren.length >= 2;
    const hasAutoLayout = !!p.autoLayout || !!p.center || hasLayoutProps || inferAutoLayout;

    // Flow direction: explicit `flow=` wins. Otherwise, default to vertical
    // (the common case for top-level page containers). For inferred
    // auto-layout, vertical is also the safer default — pages stack
    // sections downward unless explicitly told otherwise.
    const isVertical = str(p.flow)?.toLowerCase() !== "horizontal";
    const flow: "HORIZONTAL" | "VERTICAL" = isVertical ? "VERTICAL" : "HORIZONTAL";

    const parentIsAL = parent?.isAutoLayout ?? false;
    const widthSzRaw  = resolveFill(resolveSize(p.width  ?? p.w), parentIsAL, parent?.width  ?? 0);
    const heightSzRaw = resolveFill(resolveSize(p.height ?? p.h), parentIsAL, parent?.height ?? 0);

    // When a frame is auto-layouted but no explicit width/height is given,
    // default to HUG. Without this, Figma keeps the frame at its default
    // 100×100 box and the content overflows visible bounds — every
    // padX/padY-only button without `width=` ends up a 100×100 square
    // with text spilling out (see screenshot bug "Shop blades →").
    // HUG is the natural "wrap to content" semantic of an auto-layout
    // container with no size declared.
    const widthSz  = widthSzRaw  ?? (hasAutoLayout ? ("hug" as const) : undefined);
    const heightSz = heightSzRaw ?? (hasAutoLayout ? ("hug" as const) : undefined);

    const fillParent       = widthSz  === "fill";
    const fillParentHeight = heightSz === "fill";
    const width  = typeof widthSz  === "number" ? widthSz  : undefined;
    const height = typeof heightSz === "number" ? heightSz : undefined;

    const fillRes   = !p.gradient ? resolveColor(p.fill) : undefined;
    const radiusRes = resolveNumber(p.radius, "radius");
    const rTLRes    = resolveNumber(p.radiusTL, "radius");
    const rTRRes    = resolveNumber(p.radiusTR, "radius");
    const rBLRes    = resolveNumber(p.radiusBL, "radius");
    const rBRRes    = resolveNumber(p.radiusBR, "radius");

    // For <Component>, collect variant axes (state, size, kind, …) — every
    // bare attr that isn't a known Frame/Text prop. Standard frame-style
    // props on a Component (fill, padX, radius, ...) configure the master,
    // not its variant identity, so they MUST be excluded from variants.
    const variantProps: Record<string, string> = {};
    if (opType === "create_component")
    {
        for (const [k, v] of Object.entries(p))
        {
            if (KNOWN_FRAME_AND_TEXT_PROPS.has(k)) continue;
            if (typeof v === "string") variantProps[k] = v;
            else if (typeof v === "number") variantProps[k] = String(v);
        }
    }

    // Resolve the emitted name. For <Component> without explicit `name=`,
    // inherit the wrapping <ComponentSet>'s name so the registry key is
    // unique per design (Button/state=default vs Card/kind=featured),
    // not collision-prone "Component/state=default".
    const explicitName = str(p.name);
    const resolvedName = explicitName
        ?? (opType === "create_component" ? parent?.componentSetName : undefined)
        ?? (isComponent ? "Component" : "Frame");

    push(state, {
        type: opType,
        id,
        name: resolvedName,
        ...parentRef(state, p),
        ...(opType === "create_component" && Object.keys(variantProps).length > 0
            ? { variants: variantProps } : {}),
        ...(width  !== undefined ? { width }  : {}),
        ...(height !== undefined ? { height } : {}),
        ...(fillParent       ? { fillParent: true }       : {}),
        ...(fillParentHeight ? { fillParentHeight: true } : {}),
        ...colorFields("fill", fillRes),
        ...numberFields("cornerRadius", radiusRes),
        ...numberFields("cornerRadiusTopLeft",     rTLRes),
        ...numberFields("cornerRadiusTopRight",    rTRRes),
        ...numberFields("cornerRadiusBottomLeft",  rBLRes),
        ...numberFields("cornerRadiusBottomRight", rBRRes),
        ...(p.clip ? { clipContent: true } : {}),
        ...(p.ignoreAutoLayout ? { ignoreAutoLayout: true } : {}),
        ...(p.x !== undefined ? { x: num(p.x) } : {}),
        ...(p.y !== undefined ? { y: num(p.y) } : {}),
    });

    if (hasAutoLayout)
    {
        // VERTICAL:   primary axis = height (Y), cross axis = width (X)
        // HORIZONTAL: primary axis = width  (X), cross axis = height (Y)
        const hugMain  = isVertical ? (heightSz === "hug") : (widthSz  === "hug");
        const hugCross = isVertical ? (widthSz  === "hug") : (heightSz === "hug");

        const primaryRaw = p.center ? "center" : (isVertical ? str(p.alignY) : str(p.alignX));
        const crossRaw   = p.center ? "center" : (isVertical ? str(p.alignX) : str(p.alignY));

        const gapRes  = resolveNumber(p.gap,  "spacing");
        const pXRes   = resolveNumber(p.padX, "spacing");
        const pYRes   = resolveNumber(p.padY, "spacing");
        const pTRes   = resolveNumber(p.padTop,    "spacing");
        const pRRes   = resolveNumber(p.padRight,  "spacing");
        const pBRes   = resolveNumber(p.padBottom, "spacing");
        const pLRes   = resolveNumber(p.padLeft,   "spacing");

        push(state, {
            type: "set_auto_layout",
            nodeId: id,
            direction: flow,
            hugMain:  hugMain  ?? false,
            hugCross: hugCross ?? false,
            ...(fillParent       ? { fillParent: true }       : {}),
            ...(fillParentHeight ? { fillParentHeight: true } : {}),
            ...numberFields("gap",      gapRes),
            ...numberFields("paddingH", pXRes),
            ...numberFields("paddingV", pYRes),
            ...numberFields("paddingTop",    pTRes),
            ...numberFields("paddingRight",  pRRes),
            ...numberFields("paddingBottom", pBRes),
            ...numberFields("paddingLeft",   pLRes),
            ...(toFigmaAlign(primaryRaw, true)  ? { align:        toFigmaAlign(primaryRaw, true)  } : {}),
            ...(toFigmaAlign(crossRaw,   false) ? { counterAlign: toFigmaAlign(crossRaw,   false) } : {}),
            ...(p.wrap !== undefined ? { wrap: !!p.wrap } : {}),
        });
    }

    if (p.gradient) applyGradient(state, id, p.gradient);
    {
        const eff = resolveBorderProps(p.border, p.stroke, p.strokeWidth ?? p.strokeWeight);
        applyStroke(state, id, eff.color, eff.weight);
    }
    applyShadow(state, id, p.shadow);
    applyDropShadow(state, id, p.dropShadow);
    applyInnerShadow(state, id, p.innerShadow);
    applyOpacity(state, id, p.opacity);

    state.stack.push({
        id,
        width:  width  ?? parent?.width  ?? 0,
        height: height ?? parent?.height ?? 0,
        isAutoLayout: hasAutoLayout,
        flow,
        componentSetName: opType === "create_component_set" ? resolvedName : undefined,
    });
    compileChildren(node, state);
    state.stack.pop();
}

function compileText(node: JsxNode, state: State): void
{
    applyComponentAs(node);

    // Snapshot what the user wrote BEFORE variant expansion. We need to know
    // which props are user-explicit vs inherited from the variant — if the
    // variant fills lineHeight/letterSpacing and we then emit them in
    // set_text_style, the plugin's `text.lineHeight = …` UNBINDS those
    // props from the bound TextStyle (figma-side: any direct write detaches
    // the style). The user perceives this as "typography ignored" because
    // editing the style in the panel no longer propagates to the node.
    const userLineHeight    = node.props.lineHeight;
    const userLetterSpacing = node.props.letterSpacing;

    // Expand variant="h1" → fontSize/fontWeight/lineHeight/letterSpacing
    // defaults. Explicit props on the node still win.
    const variantName = str(node.props.variant);
    const variant = resolveVariant(node.props.variant);
    if (variant)
    {
        if (variant.fontSize      !== undefined && node.props.fontSize      === undefined) node.props.fontSize      = variant.fontSize;
        if (variant.fontWeight    !== undefined && node.props.fontWeight    === undefined) node.props.fontWeight    = variant.fontWeight;
        if (variant.lineHeight    !== undefined && node.props.lineHeight    === undefined) node.props.lineHeight    = typeof variant.lineHeight === "number" ? variant.lineHeight : Number(variant.lineHeight);
        if (variant.letterSpacing !== undefined && node.props.letterSpacing === undefined) node.props.letterSpacing = variant.letterSpacing;
        delete node.props.variant;
    }

    const p = node.props;
    const id = str(p.id) ?? uid(state, "txt");
    const parent = top(state);
    // Pass-through hint to the plugin: bind the matching text-style by name.
    // Plugin uses it as primary signal; the expanded font props above are
    // defense-in-depth if the style hasn't materialized yet.
    const textStyleName = variant && variantName ? variantName : undefined;

    const parentIsAL = parent?.isAutoLayout ?? false;
    const widthSz  = resolveFill(resolveSize(p.width  ?? p.w), parentIsAL, parent?.width  ?? 0);
    const heightSz = resolveFill(resolveSize(p.height ?? p.h), parentIsAL, parent?.height ?? 0);
    const fillParent       = widthSz  === "fill";
    const fillParentHeight = heightSz === "fill";
    const width  = typeof widthSz  === "number" ? widthSz  : undefined;
    const height = typeof heightSz === "number" ? heightSz : undefined;

    const content  = textContent(node) || (str(p.content ?? p.text) ?? "");
    const axX      = str(p.alignX);
    const textAlign =
        axX === "center" || axX === "middle"        ? "CENTER" :
        axX === "right"  || axX === "end"           ? "RIGHT"  :
        axX === "left"   || axX === "start"         ? "LEFT"   : undefined;

    const colorRes = resolveColor(p.fill) ?? { hex: "#0F172A" };

    // Default name = first 32 chars of content. So a `<Text variant="label">Submit</Text>`
    // becomes name="Submit" in the layer panel instead of the useless "Text".
    const defaultTextName = content.slice(0, 32).trim() || "Text";

    push(state, {
        type: "create_text",
        id,
        name: str(p.name) ?? defaultTextName,
        ...parentRef(state, p),
        content,
        fontSize:   num(p.fontSize ?? p.size)          ?? 16,
        fontWeight: str(p.fontWeight ?? p.weight)      ?? "Regular",
        ...(textStyleName ? { textStyleName } : {}),
        ...colorFields("color", colorRes),
        ...(width  !== undefined ? { width }  : {}),
        ...(height !== undefined ? { height } : {}),
        ...(fillParent       ? { fillParent: true }       : {}),
        ...(fillParentHeight ? { fillParentHeight: true } : {}),
        ...(textAlign ? { textAlign } : {}),
    });

    // When a TextStyle is bound, lineHeight/letterSpacing already come from
    // the style — re-emitting them here would call `text.lineHeight = …`
    // server-side, which figma treats as a manual override and DETACHES the
    // style for that property. Only emit if the user explicitly wrote them
    // (= they really want to override the style for this one node).
    const lineHeight    = textStyleName ? num(userLineHeight)    : num(p.lineHeight);
    const letterSpacing = textStyleName ? num(userLetterSpacing) : num(p.letterSpacing);
    const axY           = str(p.alignY);
    const verticalAlign =
        axY === "center" || axY === "middle" ? "CENTER" :
        axY === "bottom" || axY === "end"    ? "BOTTOM" :
        axY === "top"    || axY === "start"  ? "TOP"    : undefined;

    if (lineHeight !== undefined || letterSpacing !== undefined || verticalAlign !== undefined)
    {
        push(state, {
            type: "set_text_style",
            nodeId: id,
            ...(lineHeight    !== undefined ? { lineHeight }    : {}),
            ...(letterSpacing !== undefined ? { letterSpacing } : {}),
            ...(verticalAlign               ? { verticalAlign } : {}),
        });
    }

    applyOpacity(state, id, p.opacity);
}

// Pull the filename from a URL: ".../lucide/star-half.svg?color=#FFC107" → "star-half".
// Falls back to "Image" if no recognizable path segment.
function imageNameFromSrc(src: string | undefined): string
{
    if (!src) return "Image";
    const path = src.split('?')[0]!.split('#')[0]!;
    const lastSeg = path.replace(/\/$/, "").split('/').pop() ?? "";
    const stem = lastSeg.replace(/\.[a-z0-9]+$/i, "").trim();
    if (!stem) return "Image";
    if (/^https?$/i.test(stem)) return "Image";
    return stem;
}

function compileImage(node: JsxNode, state: State): void
{
    applyComponentAs(node);
    const p = node.props;
    const id = str(p.id) ?? uid(state, "img");
    const parent = top(state);

    const parentIsAL = parent?.isAutoLayout ?? false;
    const widthSz  = resolveFill(resolveSize(p.width  ?? p.w), parentIsAL, parent?.width  ?? 0);
    const heightSz = resolveFill(resolveSize(p.height ?? p.h), parentIsAL, parent?.height ?? 0);
    const fillParent       = widthSz  === "fill";
    const fillParentHeight = heightSz === "fill";
    const width  = typeof widthSz  === "number" ? widthSz  : undefined;
    const height = typeof heightSz === "number" ? heightSz : 160;

    const imgFillRes = resolveColor(p.fill) ?? { hex: "#E2E8F0" };
    const imgRRes    = resolveNumber(p.radius,   "radius");
    const imgTL      = resolveNumber(p.radiusTL, "radius");
    const imgTR      = resolveNumber(p.radiusTR, "radius");
    const imgBL      = resolveNumber(p.radiusBL, "radius");
    const imgBR      = resolveNumber(p.radiusBR, "radius");

    push(state, {
        type: "create_image",
        id,
        name: str(p.name) ?? imageNameFromSrc(str(p.src)),
        ...parentRef(state, p),
        ...(width  !== undefined ? { width }  : {}),
        height,
        src: str(p.src) ?? "",
        alt: str(p.alt) ?? "",
        ...colorFields("fill", imgFillRes),
        cornerRadius: imgRRes?.value ?? 0,
        ...(imgRRes?.variableName ? { cornerRadiusVariableName: imgRRes.variableName } : {}),
        ...(fillParent       ? { fillParent: true }       : {}),
        ...(fillParentHeight ? { fillParentHeight: true } : {}),
        clipContent: true,
        ...numberFields("cornerRadiusTopLeft",     imgTL),
        ...numberFields("cornerRadiusTopRight",    imgTR),
        ...numberFields("cornerRadiusBottomLeft",  imgBL),
        ...numberFields("cornerRadiusBottomRight", imgBR),
    });

    {
        const eff = resolveBorderProps(p.border, p.stroke, p.strokeWidth ?? p.strokeWeight);
        applyStroke(state, id, eff.color, eff.weight);
    }
    applyShadow(state, id, p.shadow);
    applyDropShadow(state, id, p.dropShadow);
    applyInnerShadow(state, id, p.innerShadow);
    applyOpacity(state, id, p.opacity);
}

function compileEllipse(node: JsxNode, state: State): void
{
    applyComponentAs(node);
    const p    = node.props;
    const id   = str(p.id) ?? uid(state, "ellipse");
    const size = num(p.size);

    const fillRes = !p.gradient ? resolveColor(p.fill) : undefined;

    push(state, {
        type: "create_ellipse",
        id,
        name: str(p.name) ?? "Ellipse",
        ...parentRef(state, p),
        width:  size ?? num(p.width  ?? p.w) ?? 100,
        height: size ?? num(p.height ?? p.h) ?? 100,
        ...colorFields("fill", fillRes),
        ...(p.x !== undefined ? { x: num(p.x) } : {}),
        ...(p.y !== undefined ? { y: num(p.y) } : {}),
        ...(p.ignoreAutoLayout ? { ignoreAutoLayout: true } : {}),
    });

    if (p.gradient) applyGradient(state, id, p.gradient);
    {
        const eff = resolveBorderProps(p.border, p.stroke, p.strokeWidth ?? p.strokeWeight);
        applyStroke(state, id, eff.color, eff.weight);
    }
    applyShadow(state, id, p.shadow);
    applyDropShadow(state, id, p.dropShadow);
    applyInnerShadow(state, id, p.innerShadow);
    applyOpacity(state, id, p.opacity);
}

function compileLine(node: JsxNode, state: State): void
{
    applyComponentAs(node);
    const p      = node.props;
    const parent = top(state);
    const id     = str(p.id) ?? uid(state, "line");

    const strokeRes = resolveColor(p.stroke) ?? { hex: "#E2E8F0" };

    push(state, {
        type: "create_line",
        id,
        name: str(p.name) ?? "Line",
        ...parentRef(state, p),
        x: num(p.x) ?? 0,
        y: num(p.y) ?? 0,
        length: num(p.length ?? p.width ?? p.w) ?? parent?.width ?? 100,
        color:  strokeRes.hex,
        ...(strokeRes.variableName ? { colorVariableName: strokeRes.variableName } : {}),
        weight: num(p.strokeWidth ?? p.strokeWeight ?? p.weight) ?? 1,
        ...(p.vertical ? { rotation: 90 } : {}),
        ...(p.ignoreAutoLayout ? { ignoreAutoLayout: true } : {}),
    });

    applyShadow(state, id, p.shadow);
    applyDropShadow(state, id, p.dropShadow);
    applyInnerShadow(state, id, p.innerShadow);
    applyOpacity(state, id, p.opacity);
}

function compileRect(node: JsxNode, state: State): void
{
    applyComponentAs(node);
    const p = node.props;
    const parent = top(state);
    const id = str(p.id) ?? uid(state, "rect");

    const parentIsAL = parent?.isAutoLayout ?? false;
    const widthSz  = resolveFill(resolveSize(p.width  ?? p.w), parentIsAL, parent?.width  ?? 0);
    const heightSz = resolveFill(resolveSize(p.height ?? p.h), parentIsAL, parent?.height ?? 0);
    const fillParent       = widthSz  === "fill";
    const fillParentHeight = heightSz === "fill";
    const width  = typeof widthSz  === "number" ? widthSz  : undefined;
    const height = typeof heightSz === "number" ? heightSz : undefined;

    const fillRes = resolveColor(p.fill);
    const rRes    = resolveNumber(p.radius,   "radius");
    const rTL     = resolveNumber(p.radiusTL, "radius");
    const rTR     = resolveNumber(p.radiusTR, "radius");
    const rBL     = resolveNumber(p.radiusBL, "radius");
    const rBR     = resolveNumber(p.radiusBR, "radius");

    push(state, {
        type: "create_rect",
        id,
        name: str(p.name) ?? "Rect",
        ...parentRef(state, p),
        ...(width  !== undefined ? { width }  : {}),
        ...(height !== undefined ? { height } : {}),
        ...(fillParent       ? { fillParent: true }       : {}),
        ...(fillParentHeight ? { fillParentHeight: true } : {}),
        ...colorFields("fill", fillRes),
        ...numberFields("cornerRadius",            rRes),
        ...numberFields("cornerRadiusTopLeft",     rTL),
        ...numberFields("cornerRadiusTopRight",    rTR),
        ...numberFields("cornerRadiusBottomLeft",  rBL),
        ...numberFields("cornerRadiusBottomRight", rBR),
        ...(p.ignoreAutoLayout ? { ignoreAutoLayout: true } : {}),
        ...(p.x !== undefined ? { x: num(p.x) } : {}),
        ...(p.y !== undefined ? { y: num(p.y) } : {}),
    });
}

function compileChildren(node: JsxNode, state: State): void
{
    for (const child of node.children)
        if (typeof child === "object")
            compile(child, state);
}

function extractTextChildren(node: JsxNode): string
{
    const parts: string[] = [];
    for (const c of node.children)
        if (typeof c === "string") parts.push(c);
    return parts.join("").trim();
}

function compileInstance(node: JsxNode, state: State): void
{
    const p = node.props;
    const id = str(p.id) ?? uid(state, "ins");
    const componentName = str(p.of);
    if (!componentName)
    {
        // Without `of` we can't resolve a master — skip.
        return;
    }

    // Collect variant axes (everything that isn't a reserved Instance prop).
    const reserved = new Set([
        "id", "name", "of", "x", "y", "width", "height", "w", "h",
        "opacity", "detach", "as", "old",
    ]);
    const variantProps: Record<string, string> = {};
    for (const [k, v] of Object.entries(p))
    {
        if (reserved.has(k)) continue;
        if (typeof v === "string") variantProps[k] = v;
        else if (typeof v === "number") variantProps[k] = String(v);
    }

    // Default text-slot override: bare text children populate the first
    // text slot of the component (resolved by name on the plugin side).
    const textOverride = extractTextChildren(node);

    const widthSz  = resolveSize(p.width  ?? p.w);
    const heightSz = resolveSize(p.height ?? p.h);
    const width  = typeof widthSz  === "number" ? widthSz  : undefined;
    const height = typeof heightSz === "number" ? heightSz : undefined;

    push(state, {
        type: "create_instance",
        id,
        of: componentName,
        ...(str(p.name) ? { name: str(p.name)! } : {}),
        ...parentRef(state, p),
        ...(Object.keys(variantProps).length > 0 ? { variants: variantProps } : {}),
        ...(textOverride ? { textOverride } : {}),
        ...(width  !== undefined ? { width }  : {}),
        ...(height !== undefined ? { height } : {}),
        ...(p.opacity !== undefined ? { opacity: num(p.opacity) } : {}),
        ...(p.detach ? { detach: true } : {}),
        ...(p.x !== undefined ? { x: num(p.x) } : {}),
        ...(p.y !== undefined ? { y: num(p.y) } : {}),
    });
}

function compile(node: JsxNode, state: State): void
{
    switch (node.type)
    {
        case "Frame":        return compileFrame(node, state);
        case "Text":         return compileText(node, state);
        case "Image":        return compileImage(node, state);
        case "Rect":
        case "Rectangle":    return compileRect(node, state);
        case "Ellipse":
        case "Circle":       return compileEllipse(node, state);
        case "Line":
        case "Divider":      return compileLine(node, state);
        case "Component":    return compileFrame(node, state, "create_component");
        case "ComponentSet": return compileFrame(node, state, "create_component_set");
        case "Instance":     return compileInstance(node, state);
        default:             return compileFrame(node, state);
    }
}

export function compileJsx(nodes: JsxNode[], parentFrameId?: string): FigmaOp[]
{
    const state: State = {
        ops: [
            createEnsureTokenVariablesOp() as unknown as FigmaOp,
            createEnsureTextStylesOp() as unknown as FigmaOp,
        ],
        counter: 0,
        stack: parentFrameId
            ? [{ id: parentFrameId, width: 0, height: 0, isAutoLayout: true, flow: "VERTICAL" }]
            : [],
    };

    for (const node of nodes)
        compile(node, state);

    return state.ops;
}
