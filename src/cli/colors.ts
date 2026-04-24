import { getTerminalCapabilities } from "@/cli/terminal-capabilities";
const RESET = "\x1b[0m";

export type ThemeName = "dark" | "light";
type Palette = Record<
    | "cyan"
    | "green"
    | "yellow"
    | "red"
    | "magenta"
    | "dim"
    | "blue"
    | "orange"
    | "pink"
    | "gray",
    string
>;

function hexToAnsi(hex: string): string
{
    const normalizedHex = hex.replace(/^#/, "");
    if (normalizedHex.length !== 6)
        throw new Error(`Invalid hex color: ${hex}`);

    const red = Number.parseInt(normalizedHex.slice(0, 2), 16);
    const green = Number.parseInt(normalizedHex.slice(2, 4), 16);
    const blue = Number.parseInt(normalizedHex.slice(4, 6), 16);

    return `\x1b[38;2;${red};${green};${blue}m`;
}

const PALETTES: Record<ThemeName, Palette> = {
    dark: {
        cyan: hexToAnsi("#38BDF8"), // sky-400
        green: hexToAnsi("#4ADE80"), // green-400
        yellow: hexToAnsi("#FCD34D"), // amber-300
        red: hexToAnsi("#F87171"), // red-400
        magenta: hexToAnsi("#F472B6"), // pink-400
        dim: hexToAnsi("#64748B"), // slate-500
        blue: hexToAnsi("#60A5FA"), // blue-400
        orange: hexToAnsi("#FB923C"), // orange-400
        pink: hexToAnsi("#F472B6"), // pink-400
        gray: hexToAnsi("#94A3B8"), // slate-400
    },
    light: {
        cyan: hexToAnsi("#0D9488"), // teal-600
        green: hexToAnsi("#16A34A"), // green-600
        yellow: hexToAnsi("#D97706"), // amber-600
        red: hexToAnsi("#DC2626"), // red-600
        magenta: hexToAnsi("#DB2777"), // pink-600
        dim: hexToAnsi("#64748B"), // slate-500
        blue: hexToAnsi("#2563EB"), // blue-600
        orange: hexToAnsi("#EA580C"), // orange-600
        pink: hexToAnsi("#DB2777"), // pink-600
        gray: hexToAnsi("#64748B"), // slate-500
    },
};

function resolveTheme(): ThemeName
{
    const value = process.env.POOPSEEK_THEME?.toLowerCase();
    if (value === "light") return "light";
    return "dark";
}

let activeTheme: ThemeName = resolveTheme();
let colorEnabled = getTerminalCapabilities().colorSupport !== "none";

function getPalette(): Palette
{
    return PALETTES[activeTheme];
}

function wrap(code: string, value: string): string
{
    if (!colorEnabled) return value;
    return `${code}${value}${RESET}`;
}

function wrapBasic(code: number, value: string): string
{
    return wrap(`\x1b[${code}m`, value);
}

function wrapAdaptive(hexCode: string, basicCode: number, value: string): string
{
    const colorSupport = getTerminalCapabilities().colorSupport;
    if (colorSupport === "none") return value;
    if (colorSupport === "basic") return wrapBasic(basicCode, value);
    return wrap(hexCode, value);
}

export const colors = {
    cyan: (value: string): string => wrapAdaptive(getPalette().cyan, 36, value),
    green: (value: string): string => wrapAdaptive(getPalette().green, 32, value),
    yellow: (value: string): string => wrapAdaptive(getPalette().yellow, 33, value),
    red: (value: string): string => wrapAdaptive(getPalette().red, 31, value),
    magenta: (value: string): string => wrapAdaptive(getPalette().magenta, 35, value),
    dim: (value: string): string => wrapAdaptive(getPalette().dim, 90, value),
    blue: (value: string): string => wrapAdaptive(getPalette().blue, 34, value),
    orange: (value: string): string => wrapAdaptive(getPalette().orange, 33, value),
    pink: (value: string): string => wrapAdaptive(getPalette().pink, 35, value),
    gray: (value: string): string => wrapAdaptive(getPalette().gray, 37, value),
} as const;

export function getColorMode(): {
    enabled: boolean;
    theme: ThemeName;
    support: ReturnType<typeof getTerminalCapabilities>["colorSupport"];
}
{
    return {
        enabled: colorEnabled,
        theme: activeTheme,
        support: getTerminalCapabilities().colorSupport,
    };
}

export function setTheme(theme: ThemeName): void
{
    activeTheme = theme;
}

export function setColorEnabled(enabled: boolean): void
{
    colorEnabled = enabled;
}
