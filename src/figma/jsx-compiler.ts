import type { FigmaOp } from "./types";
import type { JsxNode } from "./jsx-parser";

// ── Design tokens ─────────────────────────────────────────────────────────────

const SHADOW_PRESETS: Record<string, Record<string, unknown>> = {
    card:   { color: "#000000", x: 0, y: 2,  blur: 12, spread: 0, opacity: 0.08 },
    modal:  { color: "#000000", x: 0, y: 8,  blur: 32, spread: 0, opacity: 0.12 },
    button: { color: "#18A0FB", x: 0, y: 4,  blur: 12, spread: 0, opacity: 0.30 },
};

interface TypoSpec { fontSize: number; fontWeight: string; letterSpacing?: number; lineHeight?: number }
const TYPO: Record<string, TypoSpec> = {
    Hero:    { fontSize: 40, fontWeight: "Bold",     letterSpacing: -2 },
    H1:      { fontSize: 28, fontWeight: "Bold",     letterSpacing: -1 },
    H2:      { fontSize: 22, fontWeight: "SemiBold", letterSpacing: -0.5 },
    H3:      { fontSize: 18, fontWeight: "SemiBold" },
    Body:    { fontSize: 16, fontWeight: "Regular" },
    BodySm:  { fontSize: 14, fontWeight: "Regular" },
    Small:   { fontSize: 14, fontWeight: "Regular" },
    Caption: { fontSize: 12, fontWeight: "Regular",  letterSpacing: 0.5 },
    Label:   { fontSize: 12, fontWeight: "Medium" },
};

// ── State ─────────────────────────────────────────────────────────────────────

interface Frame
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
    n: number;
    stack: Frame[];
}

function uid(s: State, pfx: string): string { return `${pfx}_${s.n++}`; }
function top(s: State): Frame | undefined    { return s.stack.at(-1); }
function push(op: FigmaOp, s: State): void  { s.ops.push(op); }

// ── Prop helpers ──────────────────────────────────────────────────────────────

type P = Record<string, unknown>;

const str  = (v: unknown): string | undefined => v !== undefined ? String(v) : undefined;
const num  = (v: unknown): number | undefined => { const n = Number(v); return (v !== undefined && !isNaN(n)) ? n : undefined; };
const w    = (p: P, def = 100) => num(p.w ?? p.width)  ?? def;
const h    = (p: P, def = 100) => num(p.h ?? p.height) ?? def;
const text = (n: JsxNode)      => n.children.filter((c): c is string => typeof c === "string").join("").trim();

function pos(p: P): { x?: number; y?: number }
{
    const r: { x?: number; y?: number } = {};
    if (p.x !== undefined) r.x = num(p.x);
    if (p.y !== undefined) r.y = num(p.y);
    return r;
}

function frameId(s: State, p: P): { frameId?: string }
{
    const f = top(s);
    return f && !p.detach ? { frameId: f.id } : {};
}

function inferredWidth(p: P, par?: Frame): number | undefined
{
    const explicit = num(p.w ?? p.width);
    if (explicit !== undefined) return explicit;
    if (!par) return 390;

    const insetX = num(p.x);
    if (!par.isAutoLayout && insetX !== undefined)
        return Math.max(par.width - insetX * 2, 1);

    if (!par.isAutoLayout || par.layout === "VERTICAL")
        return par.width;

    return undefined;
}

// ── Style applicators ─────────────────────────────────────────────────────────

function shadow(s: State, nodeId: string, v: unknown, def?: string): void
{
    const key = str(v) ?? def;
    if (!key || key === "none" || key === "false") return;
    const preset = SHADOW_PRESETS[key];
    if (preset) push({ type: "set_shadow", nodeId, ...preset } as FigmaOp, s);
}

function stroke(s: State, nodeId: string, color: string, weight = 1, align = "INSIDE"): void
{
    push({ type: "set_stroke", nodeId, color, weight, align } as FigmaOp, s);
}

function gradient(s: State, nodeId: string, v: unknown): void
{
    const g = str(v);
    if (!g) return;
    const [from = "#18A0FB", to = "#0D8DE3", angle = "0"] = g.split(":");
    push({ type: "set_gradient", nodeId, from, to, angle: Number(angle) } as FigmaOp, s);
}

function opacity(s: State, nodeId: string, v: unknown): void
{
    if (v !== undefined) push({ type: "set_opacity", nodeId, opacity: num(v) } as FigmaOp, s);
}

// ── Children ──────────────────────────────────────────────────────────────────

function kids(node: JsxNode, s: State): void
{
    for (const c of node.children) if (typeof c === "object") compile(c, s);
}

// ── Containers ───────────────────────────────────────────────────────────────

function Screen(node: JsxNode, s: State): void
{
    const p = node.props;
    const id = str(p.id) ?? uid(s, "scr");
    const fw = w(p, 390), fh = h(p, 844);
    push({
        type: "create_frame", id,
        name: str(p.name) ?? "Screen",
        width: fw, height: fh,
        x: num(p.x) ?? 0, y: num(p.y) ?? 0,
        ...(!p.gradient ? { fill: str(p.fill) ?? "#FFFFFF" } : { fill: str(p.fill) ?? "#FFFFFF" }),
    } as FigmaOp, s);
    if (p.gradient) gradient(s, id, p.gradient);
    s.stack.push({ id, width: fw, height: fh });
    kids(node, s);
    s.stack.pop();
}

function Frame_(node: JsxNode, s: State, layout?: "HORIZONTAL" | "VERTICAL"): void
{
    const p = node.props;
    const par = top(s);
    const id = str(p.id) ?? uid(s, layout ? (layout === "VERTICAL" ? "vstk" : "hstk") : "frm");
    const explicitW = num(p.w ?? p.width);
    const explicitH = num(p.h ?? p.height);
    const fillParent = par?.layout === "HORIZONTAL" && explicitW === undefined && p.x === undefined;
    const fw = fillParent ? undefined : inferredWidth(p, par);
    const fh = explicitH ?? (layout ? undefined : 100);
    const autoWidth = fw === undefined;
    const autoHeight = fh === undefined;
    const cr = num(p.radius ?? p.cornerRadius);

    push({
        type: "create_frame", id,
        name: str(p.name) ?? node.type,
        ...frameId(s, p),
        ...(fw !== undefined ? { width: fw } : {}),
        ...(fh !== undefined ? { height: fh } : {}),
        ...pos(p),
        ...(!p.gradient && p.fill ? { fill: str(p.fill) } : {}),
        ...(cr !== undefined ? { cornerRadius: cr } : {}),
        ...(fillParent ? { fillParent: true } : {}),
    } as FigmaOp, s);

    if (layout)
    {
        const aMap: Record<string, string> = { center: "CENTER", start: "MIN", end: "MAX", "space-between": "SPACE_BETWEEN" };
        // CSS convention: align = cross axis (⊥ flow), justify = main axis (↕ flow)
        const crossAlignProp = str(p.align ?? p.counterAlign);
        const mainAlignProp  = str(p.justify ?? p.justifyContent);
        push({
            type: "set_auto_layout", nodeId: id,
            direction: layout,
            ...(layout === "VERTICAL"
                ? {
                    ...(autoHeight ? { hugMain: true } : {}),
                    ...(autoWidth && !fillParent ? { hugCross: true } : {}),
                }
                : {
                    ...(autoWidth && !fillParent ? { hugMain: true } : {}),
                    ...(autoHeight ? { hugCross: true } : {}),
                }),
            ...(p.gap       !== undefined ? { gap:      num(p.gap) } : {}),
            ...(p.padX ?? p.px ? { paddingH: num(p.padX ?? p.px) } : {}),
            ...(p.padY ?? p.py ? { paddingV: num(p.padY ?? p.py) } : {}),
            ...(crossAlignProp ? { counterAlign: aMap[crossAlignProp.toLowerCase()] ?? crossAlignProp } : {}),
            ...(mainAlignProp  ? { align:        aMap[mainAlignProp.toLowerCase()]  ?? mainAlignProp  } : {}),
        } as FigmaOp, s);
    }

    if (p.gradient) gradient(s, id, p.gradient);
    if (p.stroke)   stroke(s, id, str(p.stroke)!, num(p.strokeWeight) ?? 1);
    shadow(s, id, p.shadow);
    opacity(s, id, p.opacity);

    s.stack.push({ id, width: fw ?? par?.width ?? 200, height: fh ?? par?.height ?? 200, isAutoLayout: !!layout, layout });
    kids(node, s);
    s.stack.pop();
}

// ── Composite components ──────────────────────────────────────────────────────

function Card(node: JsxNode, s: State): void
{
    const p = node.props;
    const par = top(s);
    const id = str(p.id) ?? uid(s, "card");
    const explicitW = num(p.w ?? p.width);
    const fh = num(p.h ?? p.height);
    const fillParent = par?.layout === "HORIZONTAL" && explicitW === undefined && p.x === undefined;
    const fw = fillParent ? undefined : (explicitW ?? inferredWidth(p, par) ?? 358);
    const hasKids = node.children.some((c) => typeof c === "object");

    push({
        type: "create_frame", id,
        name: str(p.name) ?? "Карточка",
        ...frameId(s, p),
        ...(fw !== undefined ? { width: fw } : {}),
        ...(fh !== undefined ? { height: fh } : {}),
        ...pos(p),
        fill: str(p.fill) ?? "#FFFFFF",
        cornerRadius: num(p.radius) ?? 16,
        ...(fillParent ? { fillParent: true } : {}),
    } as FigmaOp, s);

    if (hasKids)
        push({
            type: "set_auto_layout", nodeId: id,
            direction: "VERTICAL",
            ...(fh === undefined ? { hugMain: true } : {}),
            gap: num(p.gap) ?? 12,
            paddingH: num(p.padX ?? p.px) ?? 16,
            paddingV: num(p.padY ?? p.py) ?? 16,
        } as FigmaOp, s);

    if (p.stroke !== false && p.stroke !== "none")
        stroke(s, id, str(p.stroke) ?? "#E5E5E5", 1, "INSIDE");
    shadow(s, id, p.shadow, "card");
    if (p.gradient) gradient(s, id, p.gradient);

    s.stack.push({ id, width: fw ?? par?.width ?? 358, height: fh ?? par?.height ?? 200, isAutoLayout: hasKids, layout: hasKids ? "VERTICAL" : undefined });
    kids(node, s);
    s.stack.pop();
}

function Button(node: JsxNode, s: State): void
{
    const p = node.props;
    const par = top(s);
    const variant = str(p.variant) ?? "primary";
    const size = str(p.size)?.toLowerCase() ?? "medium";
    const id = str(p.id) ?? uid(s, "btn");
    const label = str(p.text) ?? (text(node) || "Button");
    const useFullWidth = !!p.fullWidth;
    const explicitW = num(p.w ?? p.width);
    const sizePresets: Record<string, { height: number; paddingH: number; paddingV: number; fontSize: number }> = {
        small: { height: 40, paddingH: 16, paddingV: 10, fontSize: 14 },
        medium: { height: 52, paddingH: 24, paddingV: 16, fontSize: 16 },
        large: { height: 56, paddingH: 28, paddingV: 18, fontSize: 16 },
    };
    const preset = sizePresets[size] ?? sizePresets.medium;
    const fw = useFullWidth && !par?.isAutoLayout ? (par?.width ?? 358) : explicitW;
    const fh = num(p.h ?? p.height) ?? preset?.height ?? 52;

    const fills: Record<string, string> = { primary: "#18A0FB", secondary: "#F5F5F5", ghost: "transparent" };
    const tints: Record<string, string> = { primary: "#FFFFFF", secondary: "#1A1A1A", ghost: "#18A0FB" };
    const fillColor = str(p.fill) ?? fills[variant] ?? "#18A0FB";
    const textColor = str(p.textColor ?? p.color) ?? tints[variant] ?? "#FFFFFF";

    push({
        type: "create_frame", id,
        name: str(p.name) ?? `Кнопка / ${label}`,
        ...frameId(s, p),
        ...(fw !== undefined ? { width: fw } : {}),
        height: fh, ...pos(p),
        fill: fillColor,
        cornerRadius: num(p.radius) ?? 12,
        ...(useFullWidth && par?.layout === "VERTICAL" ? { fillParent: true } : {}),
    } as FigmaOp, s);

    push({
        type: "set_auto_layout", nodeId: id,
        direction: "HORIZONTAL", gap: 8,
        ...(fw === undefined && !useFullWidth ? { hugMain: true } : {}),
        paddingH: num(p.padX ?? p.px) ?? preset?.paddingH ?? 24,
        paddingV: num(p.padY ?? p.py) ?? preset?.paddingV ?? 16,
        align: "CENTER", counterAlign: "CENTER",
    } as FigmaOp, s);

    shadow(s, id, p.shadow, variant === "primary" ? "button" : undefined);
    if (p.gradient) gradient(s, id, p.gradient);

    const lid = uid(s, "btn_lbl");
    push({ type: "create_text", id: lid, frameId: id, content: label, fontSize: preset?.fontSize ?? 16, fontWeight: "Bold", color: textColor } as FigmaOp, s);
}

function NavBar(node: JsxNode, s: State): void
{
    const p = node.props;
    const par = top(s);
    const id = str(p.id) ?? uid(s, "nav");
    const fw = par?.width ?? 390;
    const fh = num(p.h ?? p.height) ?? 94;

    push({ type: "create_frame", id, name: "Nav Bar", ...frameId(s, p), width: fw, height: fh, x: 0, y: 0, fill: str(p.fill) ?? "#FFFFFF" } as FigmaOp, s);

    if (p.title)
        push({ type: "create_text", frameId: id, content: str(p.title)!, x: Math.round(fw / 2) - 50, y: 56, fontSize: 17, fontWeight: "Bold", color: "#1A1A1A" } as FigmaOp, s);

    push({ type: "create_line", frameId: id, x: 0, y: fh - 1, length: fw, color: "#E5E5E5", weight: 1 } as FigmaOp, s);

    s.stack.push({ id, width: fw, height: fh });
    kids(node, s);
    s.stack.pop();
}

function TabBar(node: JsxNode, s: State): void
{
    const p = node.props;
    const par = top(s);
    const id = str(p.id) ?? uid(s, "tab");
    const fw = par?.width ?? 390;
    const fh = num(p.h ?? p.height) ?? 83;
    const fy = par ? par.height - fh : 0;

    push({ type: "create_frame", id, name: "Tab Bar", ...frameId(s, p), width: fw, height: fh, x: 0, y: fy, fill: str(p.fill) ?? "#FFFFFF" } as FigmaOp, s);
    push({ type: "create_line", frameId: id, x: 0, y: 0, length: fw, color: "#E5E5E5", weight: 1 } as FigmaOp, s);

    s.stack.push({ id, width: fw, height: fh });
    kids(node, s);
    s.stack.pop();
}

function Input_(node: JsxNode, s: State): void
{
    const p = node.props;
    const par = top(s);
    const id = str(p.id) ?? uid(s, "inp");
    const inp_full = !!p.fullWidth;
    const fw = inp_full && !par?.isAutoLayout ? (par?.width ?? 358) : w(p, par ? par.width - 32 : 326);
    const fh = h(p, 52);
    const placeholder = str(p.placeholder) ?? (text(node) || "Введите текст…");

    push({ type: "create_frame", id, name: str(p.name) ?? "Input", ...frameId(s, p), width: fw, height: fh, ...pos(p), fill: str(p.fill) ?? "#F5F5F5", cornerRadius: num(p.radius) ?? 10 } as FigmaOp, s);
    push({ type: "set_auto_layout", nodeId: id, direction: "HORIZONTAL", gap: 8, paddingH: 16, paddingV: 0, align: "MIN", counterAlign: "CENTER" } as FigmaOp, s);
    stroke(s, id, str(p.stroke) ?? "#E5E5E5", 1, "INSIDE");
    push({ type: "create_text", frameId: id, content: placeholder, fontSize: 16, color: "#999999" } as FigmaOp, s);
}

function Avatar(node: JsxNode, s: State): void
{
    const p = node.props;
    const par = top(s);
    const sz = num(p.size) ?? 48;
    const id = str(p.id) ?? uid(s, "av");
    const sym = str(p.symbol ?? p.icon) ?? "👤";

    push({ type: "create_ellipse", id, name: "Avatar", ...frameId(s, p), width: sz, height: sz, ...pos(p), fill: str(p.fill) ?? "#E8F4FD" } as FigmaOp, s);
    push({ type: "create_text", frameId: par?.id, content: sym, fontSize: Math.round(sz * 0.45), color: "#18A0FB" } as FigmaOp, s);
}

function Icon_(node: JsxNode, s: State): void
{
    const p = node.props;
    const sz = num(p.size) ?? 40;
    const id = str(p.id) ?? uid(s, "ico");
    const sym = str(p.symbol ?? p.icon) ?? (text(node) || "◉");

    push({ type: "create_frame", id, name: str(p.name) ?? `Icon / ${sym}`, ...frameId(s, p), width: sz, height: sz, ...pos(p), fill: str(p.fill) ?? "#F5F5F5", cornerRadius: num(p.radius) ?? Math.round(sz * 0.22) } as FigmaOp, s);
    push({ type: "set_auto_layout", nodeId: id, direction: "HORIZONTAL", gap: 0, paddingH: 0, paddingV: 0, align: "CENTER", counterAlign: "CENTER" } as FigmaOp, s);
    push({ type: "create_text", frameId: id, content: sym, fontSize: Math.round(sz * 0.5), color: str(p.color) ?? "#1A1A1A" } as FigmaOp, s);
}

function Badge(node: JsxNode, s: State): void
{
    const p = node.props;
    const id = str(p.id) ?? uid(s, "bdg");
    const label = str(p.text) ?? (text(node) || "•");
    const textColor = str(p.textColor ?? p.color) ?? "#FFFFFF";

    push({ type: "create_frame", id, name: "Badge", ...frameId(s, p), ...pos(p), fill: str(p.fill) ?? "#18A0FB", cornerRadius: num(p.radius) ?? 100 } as FigmaOp, s);
    push({ type: "set_auto_layout", nodeId: id, direction: "HORIZONTAL", hugContent: true, gap: 0, paddingH: 10, paddingV: 4, align: "CENTER", counterAlign: "CENTER" } as FigmaOp, s);
    push({ type: "create_text", frameId: id, content: label, fontSize: num(p.size) ?? 12, fontWeight: "SemiBold", color: textColor } as FigmaOp, s);
}

// ── Primitives ────────────────────────────────────────────────────────────────

function Rect(node: JsxNode, s: State): void
{
    const p = node.props;
    const id = str(p.id) ?? uid(s, "rect");

    push({ type: "create_rect", id, name: str(p.name) ?? "Rect", ...frameId(s, p), width: w(p), height: h(p), ...pos(p), ...(!p.gradient && p.fill ? { fill: str(p.fill) } : {}), ...(p.radius !== undefined ? { cornerRadius: num(p.radius) } : {}) } as FigmaOp, s);
    if (p.gradient) gradient(s, id, p.gradient);
    if (p.stroke)   stroke(s, id, str(p.stroke)!, num(p.strokeWeight) ?? 1);
    shadow(s, id, p.shadow);
    opacity(s, id, p.opacity);
}

function Ellipse_(node: JsxNode, s: State): void
{
    const p = node.props;
    const id = str(p.id) ?? uid(s, "ell");
    push({ type: "create_ellipse", id, name: str(p.name) ?? "Ellipse", ...frameId(s, p), width: w(p), height: h(p), ...pos(p), ...(p.fill ? { fill: str(p.fill) } : {}) } as FigmaOp, s);
    opacity(s, id, p.opacity);
}

function Line_(node: JsxNode, s: State): void
{
    const p = node.props;
    const par = top(s);
    const orientation = str(p.orientation)?.toLowerCase();
    push({
        type: "create_line", name: str(p.name) ?? "Line",
        ...frameId(s, p),
        x: num(p.x) ?? 0, y: num(p.y) ?? 0,
        length: num(p.length ?? p.w ?? p.width) ?? par?.width ?? 100,
        color: str(p.color) ?? "#E5E5E5",
        weight: num(p.weight) ?? 1,
        ...((p.rotation !== undefined || orientation === "vertical")
            ? { rotation: num(p.rotation) ?? 90 }
            : {}),
    } as FigmaOp, s);
}

function Text_(node: JsxNode, s: State, typoKey?: string): void
{
    const p = node.props;
    const id = str(p.id) ?? uid(s, "txt");
    const t = TYPO[typoKey ?? ""] as TypoSpec | undefined;
    const content = text(node) || str(p.content ?? p.text) || "";

    const tw = num(p.w ?? p.width);
    const par = top(s);
    const textFillParent = par?.layout === "VERTICAL" && tw === undefined && p.x === undefined;
    push({
        type: "create_text", id,
        name: str(p.name) ?? (typoKey ?? "Text"),
        ...frameId(s, p),
        content,
        ...pos(p),
        fontSize:   num(p.size ?? p.fontSize) ?? t?.fontSize ?? 16,
        fontWeight: str(p.weight ?? p.fontWeight) ?? t?.fontWeight ?? "Regular",
        color:      str(p.color) ?? "#1A1A1A",
        ...(tw !== undefined ? { width: tw } : {}),
        ...(textFillParent ? { fillParent: true } : {}),
    } as FigmaOp, s);

    const ls = num(p.letterSpacing) ?? t?.letterSpacing;
    const lh = num(p.lineHeight)    ?? t?.lineHeight;
    const al = str(p.align ?? p.textAlign);
    if (ls !== undefined || lh !== undefined || al)
        push({
            type: "set_text_style", nodeId: id,
            ...(al ? { align: al.toUpperCase() } : {}),
            ...(ls !== undefined ? { letterSpacing: ls } : {}),
            ...(lh !== undefined ? { lineHeight: lh } : {}),
        } as FigmaOp, s);
}

// ── Dispatcher ────────────────────────────────────────────────────────────────

function compile(node: JsxNode, s: State): void
{
    switch (node.type)
    {
        case "Screen":   case "Artboard":              return Screen(node, s);
        case "Frame":                                  return Frame_(node, s);
        case "VStack":                                 return Frame_(node, s, "VERTICAL");
        case "HStack":                                 return Frame_(node, s, "HORIZONTAL");
        case "Card":                                   return Card(node, s);
        case "Button":                                 return Button(node, s);
        case "NavBar":                                 return NavBar(node, s);
        case "TabBar":                                 return TabBar(node, s);
        case "Input":                                  return Input_(node, s);
        case "Avatar":                                 return Avatar(node, s);
        case "Icon":                                   return Icon_(node, s);
        case "Badge":                                  return Badge(node, s);
        case "Rect":                                   return Rect(node, s);
        case "Ellipse":  case "Circle":               return Ellipse_(node, s);
        case "Line":     case "Divider":              return Line_(node, s);
        case "Text":                                   return Text_(node, s);
        case "Hero":                                   return Text_(node, s, "Hero");
        case "H1":                                     return Text_(node, s, "H1");
        case "H2":                                     return Text_(node, s, "H2");
        case "H3":                                     return Text_(node, s, "H3");
        case "Body":                                   return Text_(node, s, "Body");
        case "BodySm":   case "Small":                return Text_(node, s, "BodySm");
        case "Caption":                                return Text_(node, s, "Caption");
        case "Label":                                  return Text_(node, s, "Label");
        default:
            // Unknown PascalCase tag: treat as a Frame if it has element children
            if (node.children.some((c) => typeof c === "object"))
                Frame_(node, s);
    }
}

// ── Entry ─────────────────────────────────────────────────────────────────────

export function compileJsx(nodes: JsxNode[]): FigmaOp[]
{
    const s: State = { ops: [], n: 0, stack: [] };
    for (const node of nodes) compile(node, s);
    return s.ops;
}
