const RESET = "\x1b[0m";

type ThemeName = "dark" | "light";
type Palette = Record<"cyan" | "green" | "yellow" | "red" | "magenta" | "dim", string>;

const PALETTES: Record<ThemeName, Palette> = {
    dark: {
        cyan: "\x1b[96m",
        green: "\x1b[92m",
        yellow: "\x1b[93m",
        red: "\x1b[91m",
        magenta: "\x1b[95m",
        dim: "\x1b[2m",
    },
    light: {
        cyan: "\x1b[36m",
        green: "\x1b[32m",
        yellow: "\x1b[33m",
        red: "\x1b[31m",
        magenta: "\x1b[35m",
        dim: "\x1b[90m",
    },
};

function isColorDisabled(): boolean
{
    const noColor = process.env.NO_COLOR?.toLowerCase();
    if (!noColor) return false;
    return noColor === "1" || noColor === "true" || noColor === "yes";
}

function resolveTheme(): ThemeName
{
    const value = process.env.POOPSEEK_THEME?.toLowerCase();
    if (value === "light") return "light";
    return "dark";
}

const activeTheme = resolveTheme();
const colorEnabled = !isColorDisabled();
const palette = PALETTES[activeTheme];

function wrap(code: string, value: string): string
{
    if (!colorEnabled) return value;
    return `${code}${value}${RESET}`;
}

export const colors = {
    cyan: (value: string): string => wrap(palette.cyan, value),
    green: (value: string): string => wrap(palette.green, value),
    yellow: (value: string): string => wrap(palette.yellow, value),
    red: (value: string): string => wrap(palette.red, value),
    magenta: (value: string): string => wrap(palette.magenta, value),
    dim: (value: string): string => wrap(palette.dim, value),
} as const;

export const colorMode = {
    enabled: colorEnabled,
    theme: activeTheme,
} as const;
