import type { VariableColorValue } from "./design-tokens";

export interface ThemeTokenDefinition
{
    token: string;
    hex: string;
    description?: string;
}

export interface ThemeDefinition
{
    name?: string;
    tokens: ThemeTokenDefinition[];
}

export interface EnsureThemeVariablesOp
{
    type: "ensure_theme_variables";
    collection: string;
    mode: string;
    themeName: string;
    tokens: Array<{
        token: string;
        variableName: string;
        hex: string;
        description?: string;
    }>;
}

const THEME_COLLECTION = "PoopSeek Theme";
const THEME_MODE = "Base";

const DEFAULT_THEME_TOKENS: ThemeTokenDefinition[] = [
    { token: "canvas", hex: "#F8FAFC", description: "App background" },
    { token: "surface", hex: "#FFFFFF", description: "Cards and sheets" },
    { token: "surface-soft", hex: "#F1F5F9", description: "Muted surfaces" },
    { token: "brand", hex: "#10B981", description: "Primary brand color" },
    { token: "brand-soft", hex: "#ECFDF5", description: "Soft brand background" },
    { token: "accent", hex: "#7E22CE", description: "Secondary accent color" },
    { token: "accent-soft", hex: "#F3E8FF", description: "Soft accent background" },
    { token: "text", hex: "#0F172A", description: "Primary text" },
    { token: "text-muted", hex: "#475569", description: "Secondary text" },
    { token: "text-subtle", hex: "#94A3B8", description: "Tertiary text" },
    { token: "text-on-brand", hex: "#FFFFFF", description: "Text on brand fill" },
    { token: "border", hex: "#E2E8F0", description: "Default border" },
    { token: "border-strong", hex: "#CBD5E1", description: "Strong border" },
    { token: "success", hex: "#16A34A", description: "Success state" },
    { token: "warning", hex: "#D97706", description: "Warning state" },
    { token: "danger", hex: "#DC2626", description: "Danger state" },
];

let activeTheme: ThemeDefinition = {
    name: "default",
    tokens: DEFAULT_THEME_TOKENS,
};

function normalizeHex(hex: string): string
{
    const trimmed = hex.trim();
    return trimmed.startsWith("#") ? trimmed.toUpperCase() : `#${trimmed.toUpperCase()}`;
}

function normalizeTokenName(token: string): string
{
    return token.trim().toLowerCase();
}

export function getAllowedThemeColorKeys(): string[]
{
    return activeTheme.tokens.map((token) => token.token);
}

export function getActiveTheme(): ThemeDefinition
{
    return activeTheme;
}

export function setActiveTheme(theme: ThemeDefinition): void
{
    const normalizedEntries = theme.tokens.map((token) => ({
        token: normalizeTokenName(token.token),
        hex: normalizeHex(token.hex),
        description: token.description?.trim(),
    }));

    const merged = new Map(DEFAULT_THEME_TOKENS.map((token) => [token.token, { ...token }]));
    for (const token of normalizedEntries)
    {
        merged.set(token.token, token);
    }

    activeTheme = {
        name: theme.name?.trim() || "custom",
        tokens: [...merged.values()],
    };
}

export function createEnsureThemeVariablesOp(): EnsureThemeVariablesOp
{
    return {
        type: "ensure_theme_variables",
        collection: THEME_COLLECTION,
        mode: THEME_MODE,
        themeName: activeTheme.name?.trim() || "custom",
        tokens: activeTheme.tokens.map((token) => ({
            token: token.token,
            variableName: `theme/${token.token}`,
            hex: normalizeHex(token.hex),
            description: token.description,
        })),
    };
}

export function resolveThemeColorValue(key: string): VariableColorValue | undefined
{
    const token = activeTheme.tokens.find((item) => item.token === normalizeTokenName(key));
    if (!token) return undefined;

    return {
        kind: "variable-color",
        hex: normalizeHex(token.hex),
        variable: {
            collection: THEME_COLLECTION,
            mode: THEME_MODE,
            name: `theme/${token.token}`,
            resolvedType: "COLOR",
        },
    };
}
