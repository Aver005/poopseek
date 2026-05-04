import { createEnsureColorVariablesOp } from "../theme/design-tokens";
import { createEnsureThemeVariablesOp } from "../theme/theme-state";
import type { JsxNode, JsxPropValue } from "./jsx-parser";
import type { FigmaOp } from "../../types";

type SizeMode = number | "fill" | "hug";

interface FrameContext
{
    id: string;
    width: number;
    height: number;
    isAutoLayout: boolean;
    flow: "HORIZONTAL" | "VERTICAL";
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

function applyStroke(state: State, nodeId: string, color: JsxPropValue | undefined, weight: JsxPropValue | undefined): void
{
    if (color === undefined || color === false || color === "none") return;
    push(state, { type: "set_stroke", nodeId, color, weight: num(weight) ?? 1, align: "INSIDE" });
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

// Parses "x:y:blur[:spread]:color:opacity" → shadow object, or null if invalid
function parseShadow(part: string): Record<string, unknown> | null
{
    const segs = part.trim().split(":");
    if (segs.length === 5)
    {
        const [x, y, blur, color, opacity] = segs;
        return { x: Number(x), y: Number(y), blur: Number(blur), spread: 0, color, opacity: Number(opacity) };
    }
    if (segs.length === 6)
    {
        const [x, y, blur, spread, color, opacity] = segs;
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

function compileFrame(node: JsxNode, state: State): void
{
    const p = node.props;
    const parent = top(state);
    const id = str(p.id) ?? uid(state, "frm");

    const hasAutoLayout = !!p.autoLayout;
    const isVertical = str(p.flow)?.toLowerCase() !== "horizontal";
    const flow: "HORIZONTAL" | "VERTICAL" = isVertical ? "VERTICAL" : "HORIZONTAL";

    const parentIsAL = parent?.isAutoLayout ?? false;
    const widthSz  = resolveFill(resolveSize(p.width  ?? p.w), parentIsAL, parent?.width  ?? 0);
    const heightSz = resolveFill(resolveSize(p.height ?? p.h), parentIsAL, parent?.height ?? 0);

    const fillParent       = widthSz  === "fill";
    const fillParentHeight = heightSz === "fill";
    const width  = typeof widthSz  === "number" ? widthSz  : undefined;
    const height = typeof heightSz === "number" ? heightSz : undefined;

    push(state, {
        type: "create_frame",
        id,
        name: str(p.name) ?? "Frame",
        ...parentRef(state, p),
        ...(width  !== undefined ? { width }  : {}),
        ...(height !== undefined ? { height } : {}),
        ...(fillParent       ? { fillParent: true }       : {}),
        ...(fillParentHeight ? { fillParentHeight: true } : {}),
        ...(!p.gradient && p.fill !== undefined ? { fill: p.fill } : {}),
        ...(num(p.radius) !== undefined ? { cornerRadius: num(p.radius) } : {}),
        ...(p.radiusTL !== undefined ? { cornerRadiusTopLeft:     num(p.radiusTL) } : {}),
        ...(p.radiusTR !== undefined ? { cornerRadiusTopRight:    num(p.radiusTR) } : {}),
        ...(p.radiusBL !== undefined ? { cornerRadiusBottomLeft:  num(p.radiusBL) } : {}),
        ...(p.radiusBR !== undefined ? { cornerRadiusBottomRight: num(p.radiusBR) } : {}),
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

        const primaryRaw = isVertical ? str(p.alignY) : str(p.alignX);
        const crossRaw   = isVertical ? str(p.alignX) : str(p.alignY);

        push(state, {
            type: "set_auto_layout",
            nodeId: id,
            direction: flow,
            hugMain:  hugMain  ?? false,
            hugCross: hugCross ?? false,
            ...(fillParent       ? { fillParent: true }       : {}),
            ...(fillParentHeight ? { fillParentHeight: true } : {}),
            ...(p.gap    !== undefined ? { gap:      num(p.gap)    } : {}),
            ...(p.padX   !== undefined ? { paddingH: num(p.padX)   } : {}),
            ...(p.padY   !== undefined ? { paddingV: num(p.padY)   } : {}),
            ...(p.padTop    !== undefined ? { paddingTop:    num(p.padTop)    } : {}),
            ...(p.padRight  !== undefined ? { paddingRight:  num(p.padRight)  } : {}),
            ...(p.padBottom !== undefined ? { paddingBottom: num(p.padBottom) } : {}),
            ...(p.padLeft   !== undefined ? { paddingLeft:   num(p.padLeft)   } : {}),
            ...(toFigmaAlign(primaryRaw, true)  ? { align:        toFigmaAlign(primaryRaw, true)  } : {}),
            ...(toFigmaAlign(crossRaw,   false) ? { counterAlign: toFigmaAlign(crossRaw,   false) } : {}),
        });
    }

    if (p.gradient) applyGradient(state, id, p.gradient);
    applyStroke(state, id, p.stroke, p.strokeWidth ?? p.strokeWeight);
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
    });
    compileChildren(node, state);
    state.stack.pop();
}

function compileText(node: JsxNode, state: State): void
{
    const p = node.props;
    const id = str(p.id) ?? uid(state, "txt");
    const parent = top(state);

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

    push(state, {
        type: "create_text",
        id,
        name: str(p.name) ?? "Text",
        ...parentRef(state, p),
        content,
        fontSize:   num(p.fontSize ?? p.size)          ?? 16,
        fontWeight: str(p.fontWeight ?? p.weight)      ?? "Regular",
        color: p.fill ?? "#0F172A",
        ...(width  !== undefined ? { width }  : {}),
        ...(height !== undefined ? { height } : {}),
        ...(fillParent       ? { fillParent: true }       : {}),
        ...(fillParentHeight ? { fillParentHeight: true } : {}),
        ...(textAlign ? { textAlign } : {}),
    });

    const lineHeight    = num(p.lineHeight);
    const letterSpacing = num(p.letterSpacing);
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

function compileImage(node: JsxNode, state: State): void
{
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

    push(state, {
        type: "create_image",
        id,
        name: str(p.name) ?? "Image",
        ...parentRef(state, p),
        ...(width  !== undefined ? { width }  : {}),
        height,
        src: str(p.src) ?? "",
        alt: str(p.alt) ?? "",
        fill: p.fill ?? "#E2E8F0",
        cornerRadius: num(p.radius) ?? 0,
        ...(fillParent       ? { fillParent: true }       : {}),
        ...(fillParentHeight ? { fillParentHeight: true } : {}),
        clipContent: true,
        ...(p.radiusTL !== undefined ? { cornerRadiusTopLeft:     num(p.radiusTL) } : {}),
        ...(p.radiusTR !== undefined ? { cornerRadiusTopRight:    num(p.radiusTR) } : {}),
        ...(p.radiusBL !== undefined ? { cornerRadiusBottomLeft:  num(p.radiusBL) } : {}),
        ...(p.radiusBR !== undefined ? { cornerRadiusBottomRight: num(p.radiusBR) } : {}),
    });

    applyStroke(state, id, p.stroke, p.strokeWidth ?? p.strokeWeight);
    applyShadow(state, id, p.shadow);
    applyDropShadow(state, id, p.dropShadow);
    applyInnerShadow(state, id, p.innerShadow);
    applyOpacity(state, id, p.opacity);
}

function compileEllipse(node: JsxNode, state: State): void
{
    const p    = node.props;
    const id   = str(p.id) ?? uid(state, "ellipse");
    const size = num(p.size);

    push(state, {
        type: "create_ellipse",
        id,
        name: str(p.name) ?? "Ellipse",
        ...parentRef(state, p),
        width:  size ?? num(p.width  ?? p.w) ?? 100,
        height: size ?? num(p.height ?? p.h) ?? 100,
        ...(p.fill !== undefined ? { fill: p.fill } : {}),
    });

    applyStroke(state, id, p.stroke, p.strokeWidth ?? p.strokeWeight);
    applyOpacity(state, id, p.opacity);
}

function compileLine(node: JsxNode, state: State): void
{
    const p      = node.props;
    const parent = top(state);

    push(state, {
        type: "create_line",
        id:   str(p.id) ?? uid(state, "line"),
        name: str(p.name) ?? "Line",
        ...parentRef(state, p),
        x: num(p.x) ?? 0,
        y: num(p.y) ?? 0,
        length: num(p.length ?? p.width ?? p.w) ?? parent?.width ?? 100,
        color:  str(p.stroke) ?? "#E2E8F0",
        weight: num(p.strokeWidth ?? p.strokeWeight ?? p.weight) ?? 1,
        ...(p.vertical ? { rotation: 90 } : {}),
    });
}

function compileChildren(node: JsxNode, state: State): void
{
    for (const child of node.children)
        if (typeof child === "object")
            compile(child, state);
}

function compile(node: JsxNode, state: State): void
{
    switch (node.type)
    {
        case "Frame":   return compileFrame(node, state);
        case "Text":    return compileText(node, state);
        case "Image":   return compileImage(node, state);
        case "Ellipse":
        case "Circle":  return compileEllipse(node, state);
        case "Line":
        case "Divider": return compileLine(node, state);
        default:        return compileFrame(node, state);
    }
}

export function compileJsx(nodes: JsxNode[]): FigmaOp[]
{
    const state: State = {
        ops: [
            createEnsureThemeVariablesOp() as unknown as FigmaOp,
            createEnsureColorVariablesOp() as unknown as FigmaOp,
        ],
        counter: 0,
        stack: [],
    };

    for (const node of nodes)
        compile(node, state);

    return state.ops;
}
