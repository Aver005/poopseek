import { resolveClassNameProps } from "./classname";
import { createEnsureColorVariablesOp } from "../theme/design-tokens";
import { createEnsureThemeVariablesOp } from "../theme/theme-state";
import type { JsxNode } from "./jsx-parser";
import type { FigmaOp } from "../../types";

interface TypoSpec
{
    fontSize: number;
    fontWeight: string;
    letterSpacing?: number;
    lineHeight?: number;
}

interface FrameContext
{
    id: string;
    width: number;
    height: number;
    isAutoLayout?: boolean;
    layout?: "HORIZONTAL" | "VERTICAL";
}

interface State
{
    ops: FigmaOp[];
    counter: number;
    stack: FrameContext[];
}

type Props = Record<string, unknown>;

const SHADOW_PRESETS: Record<string, Record<string, unknown>> = {
    card: { color: "#000000", x: 0, y: 2, blur: 12, spread: 0, opacity: 0.08 },
    modal: { color: "#000000", x: 0, y: 8, blur: 32, spread: 0, opacity: 0.12 },
    button: { color: "#2563EB", x: 0, y: 4, blur: 12, spread: 0, opacity: 0.30 },
};

const TYPO: Record<string, TypoSpec> = {
    Hero: { fontSize: 40, fontWeight: "Bold", letterSpacing: -2, lineHeight: 44 },
    H1: { fontSize: 28, fontWeight: "Bold", letterSpacing: -1, lineHeight: 32 },
    H2: { fontSize: 22, fontWeight: "SemiBold", letterSpacing: -0.5, lineHeight: 28 },
    H3: { fontSize: 18, fontWeight: "SemiBold", lineHeight: 24 },
    Body: { fontSize: 16, fontWeight: "Regular", lineHeight: 24 },
    BodySm: { fontSize: 14, fontWeight: "Regular", lineHeight: 20 },
    Small: { fontSize: 14, fontWeight: "Regular", lineHeight: 20 },
    Caption: { fontSize: 12, fontWeight: "Regular", letterSpacing: 0.5, lineHeight: 16 },
    Label: { fontSize: 12, fontWeight: "Medium", lineHeight: 16 },
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

function str(value: unknown): string | undefined
{
    return value === undefined ? undefined : String(value);
}

function num(value: unknown): number | undefined
{
    const numberValue = Number(value);
    return value !== undefined && !Number.isNaN(numberValue) ? numberValue : undefined;
}

function textContent(node: JsxNode): string
{
    return node.children.filter((child): child is string => typeof child === "string").join("").trim();
}

function mergeProps(node: JsxNode): Props
{
    const className = typeof node.props.className === "string" ? node.props.className : "";
    const classProps = className ? resolveClassNameProps(className) : {};
    return {
        ...classProps,
        ...node.props,
    };
}

function getText(node: JsxNode, props: Props): string
{
    return str(props.label ?? props.content ?? props.text) ?? textContent(node);
}

function sanitizePropString(value: unknown): string | undefined
{
    const raw = str(value);
    if (!raw) return raw;
    const trimmed = raw.trim();
    return trimmed.replace(/^`+|`+$/g, "").trim();
}

function parentRef(state: State, props: Props): { frameId?: string }
{
    const parent = top(state);
    return parent && !props.detach ? { frameId: parent.id } : {};
}

function position(props: Props): { x?: number; y?: number }
{
    const result: { x?: number; y?: number } = {};
    const x = num(props.x);
    const y = num(props.y);
    if (x !== undefined) result.x = x;
    if (y !== undefined) result.y = y;
    return result;
}

function inferWidth(props: Props, parent?: FrameContext): number | undefined
{
    const explicit = num(props.w ?? props.width);
    if (explicit !== undefined) return explicit;
    if (props.widthMode === "FILL")
        return parent?.isAutoLayout ? undefined : parent?.width;
    if (!parent) return 390;
    if (!parent.isAutoLayout) return parent.width;
    if (parent.layout === "VERTICAL") return undefined;
    return undefined;
}

function inferHeight(props: Props, parent?: FrameContext, defaultHeight?: number): number | undefined
{
    const explicit = num(props.h ?? props.height);
    if (explicit !== undefined) return explicit;
    if (props.heightMode === "FILL")
        return parent?.isAutoLayout ? undefined : parent?.height;
    return defaultHeight;
}

function applyShadow(state: State, nodeId: string, shadow: unknown, fallback?: string): void
{
    const key = str(shadow) ?? fallback;
    if (!key || key === "none" || key === "false") return;
    const preset = SHADOW_PRESETS[key];
    if (!preset) return;
    push(state, { type: "set_shadow", nodeId, ...preset });
}

function applyStroke(state: State, nodeId: string, color: unknown, weight: unknown = 1, align = "INSIDE"): void
{
    if (color === undefined || color === false || color === "none") return;
    const resolvedWeight = num(weight) ?? 1;
    if (resolvedWeight <= 0) return;
    push(state, { type: "set_stroke", nodeId, color, weight: resolvedWeight, align });
}

function applyEdgeStroke(state: State, nodeId: string, props: Props, width: number | undefined, height: number | undefined): void
{
    const edge = str(props.borderEdge);
    if (!edge) return;
    const color = props.stroke ?? "#E2E8F0";
    const lineLength = width ?? 100;
    const y = edge === "BOTTOM" ? Math.max((height ?? 1) - 1, 0) : 0;
    push(state, {
        type: "create_line",
        id: uid(state, "edge"),
        frameId: nodeId,
        x: 0,
        y,
        length: lineLength,
        color,
        weight: num(props.strokeWeight) ?? 1,
        name: edge === "BOTTOM" ? "Border Bottom" : "Border Top",
    });
}

function applyGradient(state: State, nodeId: string, value: unknown): void
{
    const gradient = str(value);
    if (!gradient) return;
    const [from = "#2563EB", to = "#1D4ED8", angle = "0"] = gradient.split(":");
    push(state, { type: "set_gradient", nodeId, from, to, angle: Number(angle) });
}

function applyOpacity(state: State, nodeId: string, value: unknown): void
{
    const resolved = num(value);
    if (resolved === undefined) return;
    push(state, { type: "set_opacity", nodeId, opacity: resolved });
}

function applyTextStyle(state: State, nodeId: string, props: Props, preset?: TypoSpec): void
{
    const align = str(props.align ?? props.textAlign);
    const lineHeight = num(props.lineHeight) ?? preset?.lineHeight;
    const letterSpacing = num(props.letterSpacing) ?? preset?.letterSpacing;

    if (!align && lineHeight === undefined && letterSpacing === undefined) return;

    push(state, {
        type: "set_text_style",
        nodeId,
        ...(align ? { align: align.toUpperCase() } : {}),
        ...(lineHeight !== undefined ? { lineHeight } : {}),
        ...(letterSpacing !== undefined ? { letterSpacing } : {}),
    });
}

function createAutoLayout(state: State, nodeId: string, props: Props, direction: "HORIZONTAL" | "VERTICAL", options: { hugMain?: boolean; hugCross?: boolean } = {}): void
{
    const alignMap: Record<string, string> = {
        center: "CENTER",
        start: "MIN",
        end: "MAX",
        "space-between": "SPACE_BETWEEN",
    };

    const crossAlign = str(props.align ?? props.counterAlign);
    const mainAlign = str(props.justifyContent ?? props.justify);

    push(state, {
        type: "set_auto_layout",
        nodeId,
        direction,
        ...(options.hugMain ? { hugMain: true } : {}),
        ...(options.hugCross ? { hugCross: true } : {}),
        ...(props.gap !== undefined ? { gap: num(props.gap) } : {}),
        ...(props.padX ?? props.px ? { paddingH: num(props.padX ?? props.px) } : {}),
        ...(props.padY ?? props.py ? { paddingV: num(props.padY ?? props.py) } : {}),
        ...(props.paddingLeft !== undefined ? { paddingLeft: num(props.paddingLeft) } : {}),
        ...(props.paddingRight !== undefined ? { paddingRight: num(props.paddingRight) } : {}),
        ...(props.paddingTop !== undefined ? { paddingTop: num(props.paddingTop) } : {}),
        ...(props.paddingBottom !== undefined ? { paddingBottom: num(props.paddingBottom) } : {}),
        ...(crossAlign ? { counterAlign: alignMap[crossAlign.toLowerCase()] ?? crossAlign.toUpperCase() } : {}),
        ...(mainAlign ? { align: alignMap[mainAlign.toLowerCase()] ?? mainAlign.toUpperCase() } : {}),
    });
}

function compileChildren(node: JsxNode, state: State): void
{
    for (const child of node.children)
        if (typeof child === "object")
            compile(child, state);
}

function compileFrame(node: JsxNode, state: State, forcedLayout?: "HORIZONTAL" | "VERTICAL", defaults: Partial<Props> = {}): void
{
    const props = { ...defaults, ...mergeProps(node) };
    const parent = top(state);
    const layoutMode = forcedLayout ?? (str(props.layoutMode) as "HORIZONTAL" | "VERTICAL" | undefined);
    const id = str(props.id) ?? uid(state, layoutMode === "VERTICAL" ? "vstk" : layoutMode === "HORIZONTAL" ? "hstk" : "frm");
    const fillParent = props.widthMode === "FILL" || (!!props.fullWidth && parent?.layout === "VERTICAL");
    const fillParentHeight = props.heightMode === "FILL";
    const width = fillParent ? undefined : inferWidth(props, parent);
    const height = inferHeight(props, parent, layoutMode ? undefined : 100);
    const autoWidth = width === undefined;
    const autoHeight = height === undefined;

    push(state, {
        type: "create_frame",
        id,
        name: str(props.name) ?? node.type,
        ...parentRef(state, props),
        ...(width !== undefined ? { width } : {}),
        ...(height !== undefined ? { height } : {}),
        ...position(props),
        ...(!props.gradient && props.fill !== undefined ? { fill: props.fill } : {}),
        ...(num(props.radius ?? props.cornerRadius) !== undefined ? { cornerRadius: num(props.radius ?? props.cornerRadius) } : {}),
        ...(props.radiusTopLeft !== undefined ? { cornerRadiusTopLeft: num(props.radiusTopLeft) } : {}),
        ...(props.radiusTopRight !== undefined ? { cornerRadiusTopRight: num(props.radiusTopRight) } : {}),
        ...(fillParent ? { fillParent: true } : {}),
        ...(fillParentHeight ? { fillParentHeight: true } : {}),
        ...(props.clipContent ? { clipContent: true } : {}),
    });

    if (layoutMode)
    {
        createAutoLayout(state, id, props, layoutMode, {
            hugMain: autoHeight || layoutMode === "HORIZONTAL",
            hugCross: autoWidth || layoutMode === "VERTICAL",
        });
    }

    if (props.gradient) applyGradient(state, id, props.gradient);
    if (props.borderEdge)
        applyEdgeStroke(state, id, props, width, height);
    else
        applyStroke(state, id, props.stroke, props.strokeWeight);
    applyShadow(state, id, props.shadow);
    applyOpacity(state, id, props.opacity);

    state.stack.push({
        id,
        width: width ?? parent?.width ?? 200,
        height: height ?? parent?.height ?? 200,
        isAutoLayout: !!layoutMode,
        layout: layoutMode,
    });
    compileChildren(node, state);
    state.stack.pop();
}

function compileScreen(node: JsxNode, state: State): void
{
    const props = mergeProps(node);
    const id = str(props.id) ?? uid(state, "screen");
    const width = num(props.w ?? props.width)
        ?? (props.widthMode === "FILL" ? 1440 : 390);
    const height = num(props.h ?? props.height)
        ?? (props.heightMode === "FILL" ? 900 : 844);
    const layoutMode = str(props.layoutMode) as "HORIZONTAL" | "VERTICAL" | undefined;

    push(state, {
        type: "create_frame",
        id,
        name: str(props.name) ?? "Screen",
        width,
        height,
        x: num(props.x) ?? 0,
        y: num(props.y) ?? 0,
        ...(!props.gradient && props.fill !== undefined ? { fill: props.fill } : { fill: props.fill ?? "#FFFFFF" }),
        ...(props.clipContent ? { clipContent: true } : {}),
    });

    if (layoutMode)
        createAutoLayout(state, id, props, layoutMode, { hugMain: false, hugCross: false });

    if (props.gradient) applyGradient(state, id, props.gradient);
    if (props.borderEdge)
        applyEdgeStroke(state, id, props, width, height);
    else
        applyStroke(state, id, props.stroke, props.strokeWeight);
    applyShadow(state, id, props.shadow);
    applyOpacity(state, id, props.opacity);

    state.stack.push({ id, width, height, isAutoLayout: !!layoutMode, layout: layoutMode });
    compileChildren(node, state);
    state.stack.pop();
}

function compileCard(node: JsxNode, state: State): void
{
    compileFrame(node, state, "VERTICAL", {
        fill: "#FFFFFF",
        radius: 16,
        gap: 12,
        padX: 16,
        padY: 16,
        stroke: "#E2E8F0",
        strokeWeight: 1,
        shadow: "card",
    });
}

function compileText(node: JsxNode, state: State, presetName?: string): void
{
    const props = mergeProps(node);
    const preset = presetName ? TYPO[presetName] : undefined;
    const parent = top(state);
    const id = str(props.id) ?? uid(state, "txt");
    const width = num(props.w ?? props.width);
    const fillParent = props.widthMode === "FILL" || (parent?.layout === "VERTICAL" && width === undefined && props.x === undefined);
    const content = getText(node, props);

    push(state, {
        type: "create_text",
        id,
        name: str(props.name) ?? (presetName ?? "Text"),
        ...parentRef(state, props),
        content,
        ...position(props),
        fontSize: num(props.size ?? props.fontSize) ?? preset?.fontSize ?? 16,
        fontWeight: str(props.weight ?? props.fontWeight) ?? preset?.fontWeight ?? "Regular",
        color: props.color ?? props.textColor ?? "#0F172A",
        ...(width !== undefined ? { width } : {}),
        ...(fillParent ? { fillParent: true } : {}),
        ...(props.heightMode === "FILL" ? { fillParentHeight: true } : {}),
    });

    applyTextStyle(state, id, props, preset);
    applyOpacity(state, id, props.opacity);
}

function compileButton(node: JsxNode, state: State): void
{
    const props = mergeProps(node);
    const parent = top(state);
    const variant = str(props.variant)?.toLowerCase() ?? "primary";
    const size = str(props.size)?.toLowerCase() ?? "medium";
    const id = str(props.id) ?? uid(state, "btn");
    const label = getText(node, props);
    const presets: Record<string, { height: number; paddingH: number; paddingV: number; fontSize: number }> = {
        small: { height: 40, paddingH: 16, paddingV: 10, fontSize: 14 },
        medium: { height: 52, paddingH: 24, paddingV: 16, fontSize: 16 },
        large: { height: 56, paddingH: 28, paddingV: 18, fontSize: 16 },
    };
    const variantDefaults: Record<string, { fill: unknown; textColor: unknown; shadow?: string }> = {
        primary: { fill: "#2563EB", textColor: "#FFFFFF", shadow: "button" },
        secondary: { fill: "#F1F5F9", textColor: "#0F172A" },
        ghost: { fill: "#FFFFFF00", textColor: "#2563EB" },
    };

    const preset = presets[size] ?? presets.medium!;
    const variantPreset = variantDefaults[variant] ?? variantDefaults.primary!;
    const fillParent = props.widthMode === "FILL" || !!props.fullWidth;
    const width = fillParent ? undefined : num(props.w ?? props.width);
    const height = num(props.h ?? props.height) ?? preset.height;

    push(state, {
        type: "create_frame",
        id,
        name: str(props.name) ?? `Button / ${label}`,
        ...parentRef(state, props),
        ...(width !== undefined ? { width } : {}),
        height,
        ...position(props),
        fill: props.fill ?? variantPreset.fill,
        cornerRadius: num(props.radius ?? props.cornerRadius) ?? 12,
        ...(fillParent && parent?.layout === "VERTICAL" ? { fillParent: true } : {}),
    });

    createAutoLayout(state, id, {
        ...props,
        gap: props.gap ?? 8,
        padX: props.padX ?? preset.paddingH,
        padY: props.padY ?? preset.paddingV,
        align: "center",
        justifyContent: "center",
    }, "HORIZONTAL", {
        hugMain: width === undefined && !fillParent,
        hugCross: false,
    });

    applyShadow(state, id, props.shadow, variantPreset.shadow);
    applyStroke(state, id, props.stroke, props.strokeWeight);
    applyGradient(state, id, props.gradient);
    applyOpacity(state, id, props.opacity);

    push(state, {
        type: "create_text",
        id: uid(state, "btn_txt"),
        frameId: id,
        content: label,
        fontSize: num(props.size ?? props.fontSize) ?? preset.fontSize,
        fontWeight: str(props.weight ?? props.fontWeight) ?? "Bold",
        color: props.textColor ?? props.color ?? variantPreset.textColor,
    });
}

function compileInput(node: JsxNode, state: State): void
{
    const props = mergeProps(node);
    const parent = top(state);
    const id = str(props.id) ?? uid(state, "input");
    const fillParent = props.widthMode === "FILL" || !!props.fullWidth;
    const width = fillParent ? undefined : (num(props.w ?? props.width) ?? (parent ? parent.width - 32 : 320));
    const height = num(props.h ?? props.height) ?? 52;
    const placeholder = getText(node, props) || str(props.placeholder) || "Enter text";

    push(state, {
        type: "create_frame",
        id,
        name: str(props.name) ?? "Input",
        ...parentRef(state, props),
        ...(width !== undefined ? { width } : {}),
        height,
        ...position(props),
        fill: props.fill ?? "#F8FAFC",
        cornerRadius: num(props.radius ?? props.cornerRadius) ?? 10,
        ...(fillParent && parent?.layout === "VERTICAL" ? { fillParent: true } : {}),
    });

    createAutoLayout(state, id, {
        ...props,
        gap: props.gap ?? 8,
        padX: props.padX ?? 16,
        padY: props.padY ?? 14,
        align: "center",
    }, "HORIZONTAL");

    applyStroke(state, id, props.stroke ?? "#CBD5E1", props.strokeWeight ?? 1);
    push(state, {
        type: "create_text",
        id: uid(state, "input_txt"),
        frameId: id,
        content: placeholder,
        fontSize: num(props.size ?? props.fontSize) ?? 16,
        fontWeight: str(props.weight ?? props.fontWeight) ?? "Regular",
        color: props.color ?? "#64748B",
    });
}

function compileBadge(node: JsxNode, state: State): void
{
    const props = mergeProps(node);
    const id = str(props.id) ?? uid(state, "badge");
    const label = getText(node, props) || "Badge";

    push(state, {
        type: "create_frame",
        id,
        name: str(props.name) ?? "Badge",
        ...parentRef(state, props),
        ...position(props),
        fill: props.fill ?? "#2563EB",
        cornerRadius: num(props.radius ?? props.cornerRadius) ?? 999,
    });

    createAutoLayout(state, id, {
        ...props,
        gap: props.gap ?? 0,
        padX: props.padX ?? 10,
        padY: props.padY ?? 4,
        align: "center",
        justifyContent: "center",
    }, "HORIZONTAL", { hugMain: true });

    push(state, {
        type: "create_text",
        id: uid(state, "badge_txt"),
        frameId: id,
        content: label,
        fontSize: num(props.size ?? props.fontSize) ?? 12,
        fontWeight: str(props.weight ?? props.fontWeight) ?? "SemiBold",
        color: props.textColor ?? props.color ?? "#FFFFFF",
    });
}

function compileIcon(node: JsxNode, state: State): void
{
    const props = mergeProps(node);
    const id = str(props.id) ?? uid(state, "icon");
    const size = num(props.size ?? props.w ?? props.width) ?? 40;
    const symbol = str(props.symbol ?? props.icon) ?? (getText(node, props) || "◉");

    push(state, {
        type: "create_frame",
        id,
        name: str(props.name) ?? `Icon / ${symbol}`,
        ...parentRef(state, props),
        width: size,
        height: size,
        ...position(props),
        fill: props.fill ?? "#F1F5F9",
        cornerRadius: num(props.radius ?? props.cornerRadius) ?? 12,
    });

    createAutoLayout(state, id, { align: "center", justifyContent: "center" }, "HORIZONTAL");
    push(state, {
        type: "create_text",
        id: uid(state, "icon_txt"),
        frameId: id,
        content: symbol,
        fontSize: Math.round(size * 0.45),
        fontWeight: "Medium",
        color: props.color ?? "#0F172A",
    });
}

function compileAvatar(node: JsxNode, state: State): void
{
    const props = mergeProps(node);
    const size = num(props.size ?? props.w ?? props.width) ?? 48;
    const symbol = str(props.symbol ?? props.icon) ?? "👤";
    const id = str(props.id) ?? uid(state, "avatar");

    push(state, {
        type: "create_frame",
        id,
        name: str(props.name) ?? "Avatar",
        ...parentRef(state, props),
        width: size,
        height: size,
        ...position(props),
        fill: props.fill ?? "#DBEAFE",
        cornerRadius: 999,
    });

    createAutoLayout(state, id, { align: "center", justifyContent: "center" }, "HORIZONTAL");
    push(state, {
        type: "create_text",
        id: uid(state, "avatar_txt"),
        frameId: id,
        content: symbol,
        fontSize: Math.round(size * 0.4),
        fontWeight: "Medium",
        color: props.color ?? "#2563EB",
    });
}

function compileImage(node: JsxNode, state: State): void
{
    const props = mergeProps(node);
    const parent = top(state);
    const id = str(props.id) ?? uid(state, "img");
    const fillParent = props.widthMode === "FILL";
    const width = fillParent ? undefined : (num(props.w ?? props.width) ?? inferWidth(props, parent) ?? 240);
    const height = num(props.h ?? props.height) ?? 160;

    push(state, {
        type: "create_image",
        id,
        name: str(props.name) ?? "Image",
        ...parentRef(state, props),
        ...(width !== undefined ? { width } : {}),
        height,
        ...position(props),
        src: sanitizePropString(props.src) ?? "",
        alt: sanitizePropString(props.alt) ?? "",
        fill: props.fill ?? "#E2E8F0",
        cornerRadius: num(props.radius ?? props.cornerRadius) ?? 12,
        ...(props.radiusTopLeft !== undefined ? { cornerRadiusTopLeft: num(props.radiusTopLeft) } : {}),
        ...(props.radiusTopRight !== undefined ? { cornerRadiusTopRight: num(props.radiusTopRight) } : {}),
        ...(fillParent && parent?.layout === "VERTICAL" ? { fillParent: true } : {}),
        ...(props.clipContent ? { clipContent: true } : { clipContent: true }),
    });

    applyStroke(state, id, props.stroke, props.strokeWeight);
    applyShadow(state, id, props.shadow);
    applyOpacity(state, id, props.opacity);
}

function compileRect(node: JsxNode, state: State): void
{
    const props = mergeProps(node);
    const id = str(props.id) ?? uid(state, "rect");

    push(state, {
        type: "create_rect",
        id,
        name: str(props.name) ?? "Rect",
        ...parentRef(state, props),
        width: num(props.w ?? props.width) ?? 100,
        height: num(props.h ?? props.height) ?? 100,
        ...position(props),
        ...(!props.gradient && props.fill !== undefined ? { fill: props.fill } : {}),
        ...(num(props.radius ?? props.cornerRadius) !== undefined ? { cornerRadius: num(props.radius ?? props.cornerRadius) } : {}),
    });

    applyGradient(state, id, props.gradient);
    applyStroke(state, id, props.stroke, props.strokeWeight);
    applyShadow(state, id, props.shadow);
    applyOpacity(state, id, props.opacity);
}

function compileEllipse(node: JsxNode, state: State): void
{
    const props = mergeProps(node);
    const id = str(props.id) ?? uid(state, "ellipse");
    const size = num(props.size);

    push(state, {
        type: "create_ellipse",
        id,
        name: str(props.name) ?? "Ellipse",
        ...parentRef(state, props),
        width: size ?? num(props.w ?? props.width) ?? 100,
        height: size ?? num(props.h ?? props.height) ?? 100,
        ...position(props),
        ...(props.fill !== undefined ? { fill: props.fill } : {}),
    });

    applyStroke(state, id, props.stroke, props.strokeWeight);
    applyOpacity(state, id, props.opacity);
}

function compileLine(node: JsxNode, state: State): void
{
    const props = mergeProps(node);
    const parent = top(state);
    const orientation = str(props.orientation)?.toLowerCase();

    push(state, {
        type: "create_line",
        id: str(props.id) ?? uid(state, "line"),
        name: str(props.name) ?? "Divider",
        ...parentRef(state, props),
        x: num(props.x) ?? 0,
        y: num(props.y) ?? 0,
        length: num(props.length ?? props.w ?? props.width) ?? parent?.width ?? 100,
        color: props.color ?? props.stroke ?? "#E2E8F0",
        weight: num(props.weight ?? props.strokeWeight) ?? 1,
        ...((props.rotation !== undefined || orientation === "vertical")
            ? { rotation: num(props.rotation) ?? 90 }
            : {}),
    });
}

function compileNavBar(node: JsxNode, state: State): void
{
    const props = mergeProps(node);
    const parent = top(state);
    const id = str(props.id) ?? uid(state, "navbar");
    const width = parent?.width ?? 390;
    const height = num(props.h ?? props.height) ?? 94;

    push(state, {
        type: "create_frame",
        id,
        name: str(props.name) ?? "Nav Bar",
        ...parentRef(state, props),
        width,
        height,
        x: num(props.x) ?? 0,
        y: num(props.y) ?? 0,
        fill: props.fill ?? "#FFFFFF",
    });

    if (props.title)
    {
        push(state, {
            type: "create_text",
            id: uid(state, "nav_title"),
            frameId: id,
            content: str(props.title) ?? "",
            x: Math.round(width / 2) - 60,
            y: 56,
            fontSize: 17,
            fontWeight: "Bold",
            color: "#0F172A",
        });
    }

    if (props.borderEdge)
        applyEdgeStroke(state, id, props, width, height);
    else
        push(state, {
            type: "create_line",
            id: uid(state, "nav_divider"),
            frameId: id,
            x: 0,
            y: height - 1,
            length: width,
            color: "#E2E8F0",
            weight: 1,
            name: "Border Bottom",
        });
}

function compileTabBar(node: JsxNode, state: State): void
{
    const props = mergeProps(node);
    const parent = top(state);
    const id = str(props.id) ?? uid(state, "tabbar");
    const width = parent?.width ?? 390;
    const height = num(props.h ?? props.height) ?? 83;

    push(state, {
        type: "create_frame",
        id,
        name: str(props.name) ?? "Tab Bar",
        ...parentRef(state, props),
        width,
        height,
        x: num(props.x) ?? 0,
        y: num(props.y) ?? ((parent?.height ?? height) - height),
        fill: props.fill ?? "#FFFFFF",
    });

    if (props.borderEdge)
        applyEdgeStroke(state, id, props, width, height);
    else
        push(state, {
            type: "create_line",
            id: uid(state, "tab_divider"),
            frameId: id,
            x: 0,
            y: 0,
            length: width,
            color: "#E2E8F0",
            weight: 1,
            name: "Border Top",
        });
}

function compile(node: JsxNode, state: State): void
{
    switch (node.type)
    {
        case "Screen": return compileScreen(node, state);
        case "Frame": return compileFrame(node, state);
        case "VStack": return compileFrame(node, state, "VERTICAL");
        case "HStack": return compileFrame(node, state, "HORIZONTAL");
        case "Card": return compileCard(node, state);
        case "Text": return compileText(node, state);
        case "Hero": return compileText(node, state, "Hero");
        case "H1": return compileText(node, state, "H1");
        case "H2": return compileText(node, state, "H2");
        case "H3": return compileText(node, state, "H3");
        case "Body": return compileText(node, state, "Body");
        case "BodySm":
        case "Small": return compileText(node, state, "BodySm");
        case "Caption": return compileText(node, state, "Caption");
        case "Label": return compileText(node, state, "Label");
        case "Button": return compileButton(node, state);
        case "Image": return compileImage(node, state);
        case "Input": return compileInput(node, state);
        case "Badge": return compileBadge(node, state);
        case "Icon": return compileIcon(node, state);
        case "Avatar": return compileAvatar(node, state);
        case "Rect": return compileRect(node, state);
        case "Ellipse":
        case "Circle": return compileEllipse(node, state);
        case "Line":
        case "Divider": return compileLine(node, state);
        case "NavBar": return compileNavBar(node, state);
        case "TabBar": return compileTabBar(node, state);
        default: return compileFrame(node, state);
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

