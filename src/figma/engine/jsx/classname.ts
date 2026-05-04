import { COLOR_TOKEN_KEYS, createVariableColorValue, type VariableColorValue } from "../theme/design-tokens";
import { getAllowedThemeColorKeys, resolveThemeColorValue } from "../theme/theme-state";

export type ClassLayoutMode = "HORIZONTAL" | "VERTICAL";

export interface ClassNameProps
{
    layoutMode?: ClassLayoutMode;
    gap?: number;
    padX?: number;
    padY?: number;
    paddingLeft?: number;
    paddingRight?: number;
    paddingTop?: number;
    paddingBottom?: number;
    marginLeft?: number;
    marginRight?: number;
    marginTop?: number;
    marginBottom?: number;
    w?: number;
    h?: number;
    widthMode?: "FILL";
    heightMode?: "FILL";
    fill?: VariableColorValue | string;
    gradient?: string;
    color?: VariableColorValue | string;
    stroke?: VariableColorValue | string;
    strokeWeight?: number;
    borderEdge?: "TOP" | "BOTTOM";
    radius?: number;
    radiusTopLeft?: number;
    radiusTopRight?: number;
    radiusBottomLeft?: number;
    radiusBottomRight?: number;
    shadow?: "card" | "modal" | "button";
    align?: "start" | "center" | "end";
    justifyContent?: "start" | "center" | "end" | "space-between";
    fontSize?: number;
    fontWeight?: string;
    lineHeight?: number;
    letterSpacing?: number;
    textAlign?: "LEFT" | "CENTER" | "RIGHT";
    clipContent?: boolean;
    opacity?: number;
    shrink?: boolean;
    grow?: boolean;
}

const SPACING_SCALE = new Map<string, number>([
    ["0", 0],
    ["px", 1],
    ["0.5", 2],
    ["1", 4],
    ["1.5", 6],
    ["2", 8],
    ["2.5", 10],
    ["3", 12],
    ["3.5", 14],
    ["4", 16],
    ["5", 20],
    ["6", 24],
    ["7", 28],
    ["8", 32],
    ["9", 36],
    ["10", 40],
    ["11", 44],
    ["12", 48],
    ["14", 56],
    ["16", 64],
    ["20", 80],
    ["24", 96],
    ["28", 112],
    ["32", 128],
    ["36", 144],
    ["40", 160],
    ["44", 176],
    ["48", 192],
    ["52", 208],
    ["56", 224],
    ["60", 240],
    ["64", 256],
    ["72", 288],
    ["80", 320],
    ["96", 384],
]);

const FONT_SIZE_SCALE = new Map<string, number>([
    ["xs", 12],
    ["sm", 14],
    ["base", 16],
    ["lg", 18],
    ["xl", 20],
    ["2xl", 24],
    ["3xl", 30],
    ["4xl", 36],
    ["5xl", 48],
    ["6xl", 60],
    ["7xl", 72],
    ["8xl", 96],
    ["9xl", 128],
]);

const LINE_HEIGHT_SCALE = new Map<string, number>([
    ["none", 16],
    ["tight", 20],
    ["snug", 22],
    ["normal", 24],
    ["relaxed", 28],
    ["loose", 32],
]);

const LETTER_SPACING_SCALE = new Map<string, number>([
    ["tighter", -2],
    ["tight", -1],
    ["normal", 0],
    ["wide", 2],
    ["wider", 4],
    ["widest", 8],
]);

const RADIUS_SCALE = new Map<string, number>([
    ["rounded", 4],
    ["rounded-sm", 2],
    ["rounded-md", 6],
    ["rounded-lg", 8],
    ["rounded-xl", 12],
    ["rounded-2xl", 16],
    ["rounded-3xl", 24],
    ["rounded-full", 999],
    ["rounded-none", 0],
]);

const RADIUS_VALUE_MAP = new Map<string, number>([
    ["sm", 2],
    ["", 4],
    ["md", 6],
    ["lg", 8],
    ["xl", 12],
    ["2xl", 16],
    ["3xl", 24],
    ["full", 999],
    ["none", 0],
]);

const SHADOW_SCALE = new Map<string, "card" | "modal" | "button">([
    ["shadow-sm", "card"],
    ["shadow", "card"],
    ["shadow-md", "button"],
    ["shadow-lg", "modal"],
    ["shadow-xl", "modal"],
]);

const OPACITY_SCALE = new Map<string, number>([
    ["0", 0],
    ["5", 0.05],
    ["10", 0.1],
    ["20", 0.2],
    ["25", 0.25],
    ["30", 0.3],
    ["40", 0.4],
    ["50", 0.5],
    ["60", 0.6],
    ["70", 0.7],
    ["75", 0.75],
    ["80", 0.8],
    ["90", 0.9],
    ["95", 0.95],
    ["100", 1],
]);

const SCREEN_TOKENS = new Map<string, Partial<ClassNameProps>>([
    ["min-h-screen", { heightMode: "FILL" }],
    ["min-w-full", { widthMode: "FILL" }],
    ["min-w-screen", { widthMode: "FILL" }],
    ["flex-1", { widthMode: "FILL" }],
    ["h-screen", { heightMode: "FILL" }],
    ["w-screen", { widthMode: "FILL" }],
    ["grow", { grow: true }],
    ["flex-grow", { grow: true }],
    ["shrink-0", { shrink: false }],
    ["flex-shrink-0", { shrink: false }],
]);

const EXACT_TOKENS = new Set([
    "flex",
    "flex-col",
    "flex-row",
    "items-start",
    "items-center",
    "items-end",
    "items-stretch",
    "justify-start",
    "justify-center",
    "justify-end",
    "justify-between",
    "w-full",
    "h-full",
    "border",
    "border-t",
    "border-b",
    "border-0",
    "border-2",
    "border-4",
    "border-8",
    "border-none",
    "font-normal",
    "font-medium",
    "font-semibold",
    "font-bold",
    "font-extrabold",
    "font-black",
    "font-light",
    "font-thin",
    "text-left",
    "text-center",
    "text-right",
    "overflow-hidden",
    "rounded-t-xl",
    "rounded-t-2xl",
    "rounded-t-3xl",
    "rounded-b-xl",
    "rounded-b-2xl",
    "rounded-b-3xl",
    ...RADIUS_SCALE.keys(),
    ...SHADOW_SCALE.keys(),
]);

// Маппинг Tailwind цветов в hex — полная палитра
const COLOR_MAP: Record<string, string> = {
    // slate
    "slate-50": "#F8FAFC",
    "slate-100": "#F1F5F9",
    "slate-200": "#E2E8F0",
    "slate-300": "#CBD5E1",
    "slate-400": "#94A3B8",
    "slate-500": "#64748B",
    "slate-600": "#475569",
    "slate-700": "#334155",
    "slate-800": "#1E293B",
    "slate-900": "#0F172A",
    "slate-950": "#020617",
    // gray
    "gray-50": "#F9FAFB",
    "gray-100": "#F3F4F6",
    "gray-200": "#E5E7EB",
    "gray-300": "#D1D5DB",
    "gray-400": "#9CA3AF",
    "gray-500": "#6B7280",
    "gray-600": "#4B5563",
    "gray-700": "#374151",
    "gray-800": "#1F2937",
    "gray-900": "#111827",
    // zinc
    "zinc-50": "#FAFAFA",
    "zinc-100": "#F4F4F5",
    "zinc-200": "#E4E4E7",
    "zinc-300": "#D4D4D8",
    "zinc-400": "#A1A1AA",
    "zinc-500": "#71717A",
    "zinc-600": "#52525B",
    "zinc-700": "#3F3F46",
    "zinc-800": "#27272A",
    "zinc-900": "#18181B",
    // red
    "red-50": "#FEF2F2",
    "red-100": "#FEE2E2",
    "red-200": "#FECACA",
    "red-300": "#FCA5A5",
    "red-400": "#F87171",
    "red-500": "#EF4444",
    "red-600": "#DC2626",
    "red-700": "#B91C1C",
    "red-800": "#991B1B",
    "red-900": "#7F1D1D",
    // orange
    "orange-50": "#FFF7ED",
    "orange-100": "#FFEDD5",
    "orange-200": "#FED7AA",
    "orange-300": "#FDBA74",
    "orange-400": "#FB923C",
    "orange-500": "#F97316",
    "orange-600": "#EA580C",
    "orange-700": "#C2410C",
    "orange-800": "#9A3412",
    "orange-900": "#7C2D12",
    // amber
    "amber-50": "#FFFBEB",
    "amber-100": "#FEF3C7",
    "amber-200": "#FDE68A",
    "amber-300": "#FCD34D",
    "amber-400": "#FBBF24",
    "amber-500": "#F59E0B",
    "amber-600": "#D97706",
    "amber-700": "#B45309",
    "amber-800": "#92400E",
    "amber-900": "#78350F",
    // yellow
    "yellow-50": "#FEFCE8",
    "yellow-100": "#FEF9C3",
    "yellow-200": "#FEF08A",
    "yellow-300": "#FDE047",
    "yellow-400": "#FACC15",
    "yellow-500": "#EAB308",
    "yellow-600": "#CA8A04",
    "yellow-700": "#A16207",
    "yellow-800": "#854D0E",
    "yellow-900": "#713F12",
    // lime
    "lime-400": "#A3E635",
    "lime-500": "#84CC16",
    "lime-600": "#65A30D",
    // green
    "green-50": "#F0FDF4",
    "green-100": "#DCFCE7",
    "green-200": "#BBF7D0",
    "green-300": "#86EFAC",
    "green-400": "#4ADE80",
    "green-500": "#22C55E",
    "green-600": "#16A34A",
    "green-700": "#15803D",
    "green-800": "#166534",
    "green-900": "#14532D",
    // emerald
    "emerald-50": "#ECFDF5",
    "emerald-100": "#D1FAE5",
    "emerald-400": "#34D399",
    "emerald-500": "#10B981",
    "emerald-600": "#059669",
    "emerald-700": "#047857",
    // teal
    "teal-400": "#2DD4BF",
    "teal-500": "#14B8A6",
    "teal-600": "#0D9488",
    "teal-700": "#0F766E",
    // cyan
    "cyan-400": "#22D3EE",
    "cyan-500": "#06B6D4",
    "cyan-600": "#0891B2",
    // sky
    "sky-400": "#38BDF8",
    "sky-500": "#0EA5E9",
    "sky-600": "#0284C7",
    // blue
    "blue-50": "#EFF6FF",
    "blue-100": "#DBEAFE",
    "blue-200": "#BFDBFE",
    "blue-300": "#93C5FD",
    "blue-400": "#60A5FA",
    "blue-500": "#3B82F6",
    "blue-600": "#2563EB",
    "blue-700": "#1D4ED8",
    "blue-800": "#1E40AF",
    "blue-900": "#1E3A8A",
    // indigo
    "indigo-50": "#EEF2FF",
    "indigo-100": "#E0E7FF",
    "indigo-400": "#818CF8",
    "indigo-500": "#6366F1",
    "indigo-600": "#4F46E5",
    "indigo-700": "#4338CA",
    "indigo-800": "#3730A3",
    "indigo-900": "#312E81",
    // violet
    "violet-50": "#F5F3FF",
    "violet-100": "#EDE9FE",
    "violet-400": "#A78BFA",
    "violet-500": "#8B5CF6",
    "violet-600": "#7C3AED",
    "violet-700": "#6D28D9",
    // purple
    "purple-50": "#FAF5FF",
    "purple-100": "#F3E8FF",
    "purple-300": "#D8B4FE",
    "purple-400": "#C084FC",
    "purple-500": "#A855F7",
    "purple-600": "#9333EA",
    "purple-700": "#7E22CE",
    "purple-800": "#6B21A8",
    "purple-900": "#581C87",
    // fuchsia
    "fuchsia-400": "#E879F9",
    "fuchsia-500": "#D946EF",
    "fuchsia-600": "#C026D3",
    // pink
    "pink-50": "#FDF2F8",
    "pink-100": "#FCE7F3",
    "pink-300": "#F9A8D4",
    "pink-400": "#F472B6",
    "pink-500": "#EC4899",
    "pink-600": "#DB2777",
    "pink-700": "#BE185D",
    // rose
    "rose-50": "#FFF1F2",
    "rose-100": "#FFE4E6",
    "rose-400": "#FB7185",
    "rose-500": "#F43F5E",
    "rose-600": "#E11D48",
    "rose-700": "#BE123C",
    // white/black/transparent
    "white": "#FFFFFF",
    "black": "#000000",
    "transparent": "#00000000",
};

function parseGradientFromClasses(tokens: string[]): string | undefined
{
    let gradientType: string | null = null;
    let fromColor: string | null = null;
    let viaColor: string | null = null;
    let toColor: string | null = null;

    for (const token of tokens)
    {
        if (token.startsWith("bg-gradient-to-")) gradientType = token.slice("bg-gradient-to-".length);
        else if (token.startsWith("from-")) fromColor = token.slice(5);
        else if (token.startsWith("via-")) viaColor = token.slice(4);
        else if (token.startsWith("to-")) toColor = token.slice(3);
    }

    if (!gradientType || !fromColor || !toColor) return undefined;

    const fromHex = COLOR_MAP[fromColor] ?? fromColor;
    const toHex = COLOR_MAP[toColor] ?? toColor;
    const viaHex = viaColor ? (COLOR_MAP[viaColor] ?? viaColor) : undefined;

    const ANGLE_MAP: Record<string, number> = {
        "r": 90, "l": 270, "b": 180, "t": 0,
        "br": 135, "bl": 225, "tr": 45, "tl": 315,
    };
    const angle = ANGLE_MAP[gradientType] ?? 135;

    return viaHex
        ? `${fromHex}:${viaHex}:${toHex}:${angle}`
        : `${fromHex}:${toHex}:${angle}`;
}

function withAlpha(color: VariableColorValue | string | unknown, opacityPercent: number): string
{
    let hex = "#000000";
    if (typeof color === "string")
        hex = color;
    else if (typeof color === "object" && color !== null && "hex" in color)
        hex = (color as { hex: string }).hex;

    const alpha = Math.round(Math.max(0, Math.min(100, opacityPercent)) / 100 * 255);
    const alphaHex = alpha.toString(16).padStart(2, "0").toUpperCase();
    return hex.slice(0, 7) + alphaHex;
}

function parseArbitrarySize(token: string): { axis: "w" | "h" | "gap" | "text" | "radius"; value: number } | null
{
    // w-[Npx], h-[Npx], min-w-[Npx], max-w-[Npx], gap-[Npx], text-[Npx], rounded-[Npx]
    const match = /^(?:min-|max-)?(w|h|gap|text|rounded)-\[(\d+(?:\.\d+)?)(px|rem|em|%|vw|vh)?\]$/.exec(token);
    if (!match) return null;

    let value = parseFloat(match[2]!);
    const unit = match[3] ?? "px";
    if (unit === "rem" || unit === "em") value *= 16;
    if (unit === "%" || unit === "vw" || unit === "vh") return null; // percentage not supported

    const axisMap: Record<string, "w" | "h" | "gap" | "text" | "radius"> = {
        w: "w", h: "h", gap: "gap", text: "text", rounded: "radius",
    };

    return { axis: axisMap[match[1]!]!, value: Math.round(value) };
}

function isSpacingToken(prefix: string, token: string): boolean
{
    if (!token.startsWith(prefix)) return false;
    return SPACING_SCALE.has(token.slice(prefix.length));
}

function isColorToken(prefix: string, token: string): boolean
{
    if (!token.startsWith(prefix)) return false;
    const colorKey = token.slice(prefix.length);
    return COLOR_TOKEN_KEYS.includes(colorKey)
        || getAllowedThemeColorKeys().includes(colorKey)
        || (prefix === "text-" && getAllowedThemeColorKeys().includes(`text-${colorKey}`));
}

function isTextSizeToken(token: string): boolean
{
    if (!token.startsWith("text-")) return false;
    return FONT_SIZE_SCALE.has(token.slice(5));
}

function isLineHeightToken(token: string): boolean
{
    if (!token.startsWith("leading-")) return false;
    return LINE_HEIGHT_SCALE.has(token.slice(8));
}

function isTrackingToken(token: string): boolean
{
    if (!token.startsWith("tracking-")) return false;
    return LETTER_SPACING_SCALE.has(token.slice(9));
}

function isOpacityToken(token: string): boolean
{
    if (!token.startsWith("opacity-")) return false;
    return OPACITY_SCALE.has(token.slice(8));
}

// Directional radius: rounded-t-*, rounded-b-*, rounded-l-*, rounded-r-*
// Corner radius: rounded-tl-*, rounded-tr-*, rounded-bl-*, rounded-br-*
function parseDirectionalRadius(token: string): Partial<ClassNameProps> | null
{
    const match = /^rounded-(t|b|l|r|tl|tr|bl|br)(?:-(.+))?$/.exec(token);
    if (!match) return null;

    const side = match[1]!;
    const sizeKey = match[2] ?? "";
    const value = RADIUS_VALUE_MAP.get(sizeKey);
    if (value === undefined) return null;

    switch (side)
    {
        case "t": return { radiusTopLeft: value, radiusTopRight: value };
        case "b": return { radiusBottomLeft: value, radiusBottomRight: value };
        case "l": return { radiusTopLeft: value, radiusBottomLeft: value };
        case "r": return { radiusTopRight: value, radiusBottomRight: value };
        case "tl": return { radiusTopLeft: value };
        case "tr": return { radiusTopRight: value };
        case "bl": return { radiusBottomLeft: value };
        case "br": return { radiusBottomRight: value };
        default: return null;
    }
}

export function tokenizeClassName(className: string): string[]
{
    return className.split(/\s+/).map((token) => token.trim()).filter(Boolean);
}

export function isAllowedClassToken(token: string): boolean
{
    if (token.includes(":")) return false;

    // Gradient tokens
    if (token.startsWith("bg-gradient-to-")) return true;
    if (token.startsWith("from-")) return true;
    if (token.startsWith("via-")) return true;
    if (token.startsWith("to-")) return true;

    // Arbitrary sizes
    if (parseArbitrarySize(token) !== null) return true;

    if (EXACT_TOKENS.has(token)) return true;
    if (SCREEN_TOKENS.has(token)) return true;

    // Spacing
    if (isSpacingToken("p-", token)) return true;
    if (isSpacingToken("px-", token)) return true;
    if (isSpacingToken("py-", token)) return true;
    if (isSpacingToken("pt-", token)) return true;
    if (isSpacingToken("pr-", token)) return true;
    if (isSpacingToken("pb-", token)) return true;
    if (isSpacingToken("pl-", token)) return true;
    if (isSpacingToken("gap-", token)) return true;
    if (isSpacingToken("space-x-", token)) return true;
    if (isSpacingToken("space-y-", token)) return true;

    // Size
    if (isSpacingToken("w-", token)) return true;
    if (isSpacingToken("h-", token)) return true;

    // Margins
    if (isSpacingToken("m-", token)) return true;
    if (isSpacingToken("mt-", token)) return true;
    if (isSpacingToken("mr-", token)) return true;
    if (isSpacingToken("mb-", token)) return true;
    if (isSpacingToken("ml-", token)) return true;
    if (isSpacingToken("mx-", token)) return true;
    if (isSpacingToken("my-", token)) return true;

    // Colors
    if (isColorToken("bg-", token)) return true;
    if (isColorToken("text-", token)) return true;
    if (isColorToken("border-", token)) return true;

    // Typography
    if (isTextSizeToken(token)) return true;
    if (isLineHeightToken(token)) return true;
    if (isTrackingToken(token)) return true;

    // Opacity
    if (isOpacityToken(token)) return true;

    // Directional radius
    if (parseDirectionalRadius(token) !== null) return true;

    return false;
}

function readScaleValue(prefix: string, token: string): number
{
    const value = SPACING_SCALE.get(token.slice(prefix.length));
    if (value === undefined) throw new Error(`Unsupported spacing token "${token}"`);
    return value;
}

export function resolveClassNameProps(className: string): ClassNameProps
{
    const result: ClassNameProps = {};
    const tokens = tokenizeClassName(className);

    const gradient = parseGradientFromClasses(tokens);
    if (gradient) result.gradient = gradient;

    for (const token of tokens)
    {
        const screenProps = SCREEN_TOKENS.get(token);
        if (screenProps)
        {
            Object.assign(result, screenProps);
            continue;
        }

        // Skip gradient tokens (already processed)
        if (token.startsWith("bg-gradient-to-")) continue;
        if (token.startsWith("from-")) continue;
        if (token.startsWith("via-")) continue;
        if (token.startsWith("to-")) continue;

        // Opacity modifier: bg-white/80, text-primary/50, border-border/30
        const slashIdx = token.lastIndexOf("/");
        if (slashIdx > 0 && /^\d+$/.test(token.slice(slashIdx + 1)))
        {
            const baseToken = token.slice(0, slashIdx);
            const opacityPct = parseInt(token.slice(slashIdx + 1), 10);
            const base = resolveClassNameProps(baseToken);
            if (base.fill !== undefined) result.fill = withAlpha(base.fill, opacityPct);
            if (base.color !== undefined) result.color = withAlpha(base.color, opacityPct);
            if (base.stroke !== undefined) result.stroke = withAlpha(base.stroke, opacityPct);
            continue;
        }

        // Arbitrary sizes: w-[342px], h-[500px], gap-[32px], text-[24px], rounded-[8px]
        const arbitrarySize = parseArbitrarySize(token);
        if (arbitrarySize !== null)
        {
            if (arbitrarySize.axis === "w") result.w = arbitrarySize.value;
            else if (arbitrarySize.axis === "h") result.h = arbitrarySize.value;
            else if (arbitrarySize.axis === "gap") result.gap = arbitrarySize.value;
            else if (arbitrarySize.axis === "text") result.fontSize = arbitrarySize.value;
            else if (arbitrarySize.axis === "radius") result.radius = arbitrarySize.value;
            continue;
        }

        if (!isAllowedClassToken(token))
            continue;

        switch (token)
        {
            case "flex":
            case "flex-row":
                if (!result.layoutMode)
                    result.layoutMode = "HORIZONTAL";
                continue;
            case "flex-col":
                if (!result.layoutMode)
                    result.layoutMode = "VERTICAL";
                continue;
            case "items-start":
            case "items-stretch":
                result.align = "start";
                continue;
            case "items-center":
                result.align = "center";
                continue;
            case "items-end":
                result.align = "end";
                continue;
            case "justify-start":
                result.justifyContent = "start";
                continue;
            case "justify-center":
                result.justifyContent = "center";
                continue;
            case "justify-end":
                result.justifyContent = "end";
                continue;
            case "justify-between":
                result.justifyContent = "space-between";
                continue;
            case "w-full":
                result.widthMode = "FILL";
                continue;
            case "h-full":
                result.heightMode = "FILL";
                continue;
            case "border":
                result.strokeWeight = 1;
                continue;
            case "border-t":
                result.strokeWeight = 1;
                result.borderEdge = "TOP";
                continue;
            case "border-b":
                result.strokeWeight = 1;
                result.borderEdge = "BOTTOM";
                continue;
            case "border-0":
            case "border-none":
                result.strokeWeight = 0;
                continue;
            case "border-2":
                result.strokeWeight = 2;
                continue;
            case "border-4":
                result.strokeWeight = 4;
                continue;
            case "border-8":
                result.strokeWeight = 8;
                continue;
            case "font-thin":
                result.fontWeight = "Thin";
                continue;
            case "font-light":
                result.fontWeight = "Light";
                continue;
            case "font-normal":
                result.fontWeight = "Regular";
                continue;
            case "font-medium":
                result.fontWeight = "Medium";
                continue;
            case "font-semibold":
                result.fontWeight = "SemiBold";
                continue;
            case "font-bold":
                result.fontWeight = "Bold";
                continue;
            case "font-extrabold":
                result.fontWeight = "ExtraBold";
                continue;
            case "font-black":
                result.fontWeight = "Black";
                continue;
            case "text-left":
                result.textAlign = "LEFT";
                continue;
            case "text-center":
                result.textAlign = "CENTER";
                continue;
            case "text-right":
                result.textAlign = "RIGHT";
                continue;
            case "overflow-hidden":
                result.clipContent = true;
                continue;
            case "rounded-t-xl":
                result.radiusTopLeft = 12;
                result.radiusTopRight = 12;
                continue;
            case "rounded-t-2xl":
                result.radiusTopLeft = 16;
                result.radiusTopRight = 16;
                continue;
            case "rounded-t-3xl":
                result.radiusTopLeft = 24;
                result.radiusTopRight = 24;
                continue;
            case "rounded-b-xl":
                result.radiusBottomLeft = 12;
                result.radiusBottomRight = 12;
                continue;
            case "rounded-b-2xl":
                result.radiusBottomLeft = 16;
                result.radiusBottomRight = 16;
                continue;
            case "rounded-b-3xl":
                result.radiusBottomLeft = 24;
                result.radiusBottomRight = 24;
                continue;
            default:
                break;
        }

        // Full radius
        const radius = RADIUS_SCALE.get(token);
        if (radius !== undefined)
        {
            result.radius = radius;
            continue;
        }

        // Directional / corner radius
        const dirRadius = parseDirectionalRadius(token);
        if (dirRadius !== null)
        {
            Object.assign(result, dirRadius);
            continue;
        }

        const shadow = SHADOW_SCALE.get(token);
        if (shadow)
        {
            result.shadow = shadow;
            continue;
        }

        // Opacity
        if (token.startsWith("opacity-"))
        {
            const opValue = OPACITY_SCALE.get(token.slice(8));
            if (opValue !== undefined)
            {
                result.opacity = opValue;
                continue;
            }
        }

        // Padding
        if (token.startsWith("p-"))
        {
            const value = readScaleValue("p-", token);
            result.padX = value;
            result.padY = value;
            result.paddingLeft = value;
            result.paddingRight = value;
            result.paddingTop = value;
            result.paddingBottom = value;
            continue;
        }
        if (token.startsWith("px-"))
        {
            const value = readScaleValue("px-", token);
            result.padX = value;
            result.paddingLeft = value;
            result.paddingRight = value;
            continue;
        }
        if (token.startsWith("py-"))
        {
            const value = readScaleValue("py-", token);
            result.padY = value;
            result.paddingTop = value;
            result.paddingBottom = value;
            continue;
        }
        if (token.startsWith("pt-")) { result.paddingTop = readScaleValue("pt-", token); continue; }
        if (token.startsWith("pr-")) { result.paddingRight = readScaleValue("pr-", token); continue; }
        if (token.startsWith("pb-")) { result.paddingBottom = readScaleValue("pb-", token); continue; }
        if (token.startsWith("pl-")) { result.paddingLeft = readScaleValue("pl-", token); continue; }

        // Gap
        if (token.startsWith("gap-"))
        {
            result.gap = readScaleValue("gap-", token);
            continue;
        }

        // space-x-* / space-y-* → equivalent gap in auto-layout
        if (token.startsWith("space-x-"))
        {
            result.gap = readScaleValue("space-x-", token);
            if (!result.layoutMode) result.layoutMode = "HORIZONTAL";
            continue;
        }
        if (token.startsWith("space-y-"))
        {
            result.gap = readScaleValue("space-y-", token);
            if (!result.layoutMode) result.layoutMode = "VERTICAL";
            continue;
        }

        // Width
        if (token.startsWith("w-") && token !== "w-full")
        {
            result.w = readScaleValue("w-", token);
            continue;
        }

        // Height
        if (token.startsWith("h-") && token !== "h-full")
        {
            result.h = readScaleValue("h-", token);
            continue;
        }

        // Margins
        if (token.startsWith("m-"))
        {
            const v = readScaleValue("m-", token);
            result.marginTop = v; result.marginBottom = v;
            result.marginLeft = v; result.marginRight = v;
            continue;
        }
        if (token.startsWith("mt-")) { result.marginTop = readScaleValue("mt-", token); continue; }
        if (token.startsWith("mr-")) { result.marginRight = readScaleValue("mr-", token); continue; }
        if (token.startsWith("mb-")) { result.marginBottom = readScaleValue("mb-", token); continue; }
        if (token.startsWith("ml-")) { result.marginLeft = readScaleValue("ml-", token); continue; }
        if (token.startsWith("mx-"))
        {
            const v = readScaleValue("mx-", token);
            result.marginLeft = v; result.marginRight = v;
            continue;
        }
        if (token.startsWith("my-"))
        {
            const v = readScaleValue("my-", token);
            result.marginTop = v; result.marginBottom = v;
            continue;
        }

        // Background
        if (token.startsWith("bg-") && !result.gradient)
        {
            result.fill = resolveThemeColorValue(token.slice(3)) ?? createVariableColorValue(token.slice(3));
            continue;
        }

        // Border color
        if (token.startsWith("border-"))
        {
            const borderKey = token.slice(7);
            // Skip weight-only tokens (handled above)
            if (borderKey !== "0" && borderKey !== "2" && borderKey !== "4" && borderKey !== "8" && borderKey !== "none" && borderKey !== "t" && borderKey !== "b")
            {
                result.stroke = resolveThemeColorValue(borderKey) ?? createVariableColorValue(borderKey);
                if (result.strokeWeight === undefined) result.strokeWeight = 1;
            }
            continue;
        }

        // Text color / size
        if (token.startsWith("text-"))
        {
            const textKey = token.slice(5);
            const fontSize = FONT_SIZE_SCALE.get(textKey);
            if (fontSize !== undefined)
            {
                result.fontSize = fontSize;
                continue;
            }
            result.color =
                resolveThemeColorValue(textKey)
                ?? resolveThemeColorValue(`text-${textKey}`)
                ?? createVariableColorValue(textKey);
            continue;
        }

        if (token.startsWith("leading-"))
        {
            const lineHeight = LINE_HEIGHT_SCALE.get(token.slice(8));
            if (lineHeight === undefined) throw new Error(`Unsupported line-height token "${token}"`);
            result.lineHeight = lineHeight;
            continue;
        }

        if (token.startsWith("tracking-"))
        {
            const letterSpacing = LETTER_SPACING_SCALE.get(token.slice(9));
            if (letterSpacing === undefined) throw new Error(`Unsupported tracking token "${token}"`);
            result.letterSpacing = letterSpacing;
            continue;
        }
    }

    return result;
}

export function describeAllowedUtilities(): string
{
    return [
        "layout: flex, flex-col, flex-row, items-*, justify-*, space-x-*, space-y-*",
        "spacing: p-*, px-*, py-*, pt-*, pr-*, pb-*, pl-*, gap-*, gap-[Npx]",
        "margin: m-*, mt-*, mr-*, mb-*, ml-*, mx-*, my-*",
        "size: w-*, h-*, w-full, w-[Npx], h-[Npx]",
        "colors: bg-*, text-*, border-*",
        "gradients: bg-gradient-to-*, from-*, via-*, to-*",
        "theme aliases: bg-brand, bg-accent, bg-surface, text-text, text-muted, text-on-brand, border-default",
        "typography: text-xs..text-9xl, text-[Npx], font-*, leading-*, tracking-*",
        "surface: rounded*, rounded-t-*, rounded-b-*, rounded-tl/tr/bl/br-*, border, border-2/4/8, shadow*",
        "misc: overflow-hidden, opacity-*, shrink-0, grow",
    ].join("; ");
}
