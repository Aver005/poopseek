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
    w?: number;
    h?: number;
    widthMode?: "FILL";
    heightMode?: "FILL";
    fill?: VariableColorValue | string;
    color?: VariableColorValue | string;
    stroke?: VariableColorValue | string;
    strokeWeight?: number;
    borderEdge?: "TOP" | "BOTTOM";
    radius?: number;
    radiusTopLeft?: number;
    radiusTopRight?: number;
    shadow?: "card" | "modal" | "button";
    align?: "start" | "center" | "end";
    justifyContent?: "start" | "center" | "end" | "space-between";
    fontSize?: number;
    fontWeight?: string;
    lineHeight?: number;
    letterSpacing?: number;
    textAlign?: "LEFT" | "CENTER" | "RIGHT";
    clipContent?: boolean;
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
]);

const LETTER_SPACING_SCALE = new Map<string, number>([
    ["tighter", -2],
    ["tight", -1],
    ["normal", 0],
    ["wide", 2],
    ["wider", 4],
]);

const RADIUS_SCALE = new Map<string, number>([
    ["rounded", 4],
    ["rounded-md", 6],
    ["rounded-lg", 8],
    ["rounded-xl", 12],
    ["rounded-2xl", 16],
    ["rounded-3xl", 24],
    ["rounded-full", 999],
]);

const SHADOW_SCALE = new Map<string, "card" | "modal" | "button">([
    ["shadow-sm", "card"],
    ["shadow", "card"],
    ["shadow-md", "button"],
    ["shadow-lg", "modal"],
]);

const SCREEN_TOKENS = new Map<string, Partial<ClassNameProps>>([
    ["min-h-screen", { heightMode: "FILL" }],
    ["min-w-full", { widthMode: "FILL" }],
    ["min-w-screen", { widthMode: "FILL" }],
    ["flex-1", { widthMode: "FILL" }],
    ["h-screen", { heightMode: "FILL" }],
    ["w-screen", { widthMode: "FILL" }],
]);

const EXACT_TOKENS = new Set([
    "flex",
    "flex-col",
    "items-start",
    "items-center",
    "items-end",
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
    "font-normal",
    "font-medium",
    "font-semibold",
    "font-bold",
    "text-left",
    "text-center",
    "text-right",
    "overflow-hidden",
    "rounded-t-xl",
    "rounded-t-2xl",
    "rounded-t-3xl",
    ...RADIUS_SCALE.keys(),
    ...SHADOW_SCALE.keys(),
]);

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

function parseArbitrarySize(token: string): { axis: "w" | "h"; value: number } | null
{
    const match = /^(?:min-|max-)?(w|h)-\[(\d+(?:\.\d+)?)(px|rem|em)?\]$/.exec(token);
    if (!match) return null;

    let value = parseFloat(match[2]!);
    const unit = match[3] ?? "px";
    if (unit === "rem" || unit === "em") value *= 16;

    return { axis: match[1] as "w" | "h", value: Math.round(value) };
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

export function tokenizeClassName(className: string): string[]
{
    return className.split(/\s+/).map((token) => token.trim()).filter(Boolean);
}

export function isAllowedClassToken(token: string): boolean
{
    if (token.includes(":")) return false;
    if (EXACT_TOKENS.has(token)) return true;
    if (isSpacingToken("p-", token)) return true;
    if (isSpacingToken("px-", token)) return true;
    if (isSpacingToken("py-", token)) return true;
    if (isSpacingToken("pt-", token)) return true;
    if (isSpacingToken("pr-", token)) return true;
    if (isSpacingToken("pb-", token)) return true;
    if (isSpacingToken("pl-", token)) return true;
    if (isSpacingToken("gap-", token)) return true;
    if (isSpacingToken("w-", token)) return true;
    if (isSpacingToken("h-", token)) return true;
    if (isColorToken("bg-", token)) return true;
    if (isColorToken("text-", token)) return true;
    if (isColorToken("border-", token)) return true;
    if (isTextSizeToken(token)) return true;
    if (isLineHeightToken(token)) return true;
    if (isTrackingToken(token)) return true;
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

    for (const token of tokenizeClassName(className))
    {
        const screenProps = SCREEN_TOKENS.get(token);
        if (screenProps)
        {
            Object.assign(result, screenProps);
            continue;
        }

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

        // Arbitrary size: w-[342px], h-[500px], min-w-[1200px], max-w-[800px]
        const arbitrarySize = parseArbitrarySize(token);
        if (arbitrarySize !== null)
        {
            if (arbitrarySize.axis === "w") result.w = arbitrarySize.value;
            else result.h = arbitrarySize.value;
            continue;
        }

        if (!isAllowedClassToken(token))
            continue;

        switch (token)
        {
            case "flex":
                result.layoutMode = "HORIZONTAL";
                continue;
            case "flex-col":
                result.layoutMode = "VERTICAL";
                continue;
            case "items-start":
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
                result.strokeWeight = 0;
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
            default:
                break;
        }

        const radius = RADIUS_SCALE.get(token);
        if (radius !== undefined)
        {
            result.radius = radius;
            continue;
        }

        const shadow = SHADOW_SCALE.get(token);
        if (shadow)
        {
            result.shadow = shadow;
            continue;
        }

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

        if (token.startsWith("pt-"))
        {
            result.paddingTop = readScaleValue("pt-", token);
            continue;
        }

        if (token.startsWith("pr-"))
        {
            result.paddingRight = readScaleValue("pr-", token);
            continue;
        }

        if (token.startsWith("pb-"))
        {
            result.paddingBottom = readScaleValue("pb-", token);
            continue;
        }

        if (token.startsWith("pl-"))
        {
            result.paddingLeft = readScaleValue("pl-", token);
            continue;
        }

        if (token.startsWith("gap-"))
        {
            result.gap = readScaleValue("gap-", token);
            continue;
        }

        if (token.startsWith("w-"))
        {
            result.w = readScaleValue("w-", token);
            continue;
        }

        if (token.startsWith("h-"))
        {
            result.h = readScaleValue("h-", token);
            continue;
        }

        if (token.startsWith("bg-"))
        {
            result.fill = resolveThemeColorValue(token.slice(3)) ?? createVariableColorValue(token.slice(3));
            continue;
        }

        if (token.startsWith("border-"))
        {
            result.stroke = resolveThemeColorValue(token.slice(7)) ?? createVariableColorValue(token.slice(7));
            if (result.strokeWeight === undefined) result.strokeWeight = 1;
            continue;
        }

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
        "layout: flex, flex-col, items-*, justify-*",
        "spacing: p-*, px-*, py-*, pt-*, pr-*, pb-*, pl-*, gap-*",
        "size: w-*, h-*, w-full",
        "colors: bg-*, text-*, border-*",
        "theme aliases: bg-brand, bg-accent, bg-surface, text-text, text-muted, text-on-brand, border-default",
        "typography: text-xs..text-5xl, font-*, leading-*, tracking-*",
        "surface: rounded*, rounded-t-*, border, border-t, border-b, shadow*",
        "misc: overflow-hidden",
    ].join("; ");
}

