import type { VariableColorValue } from "./design-tokens";

// ─── Token model ────────────────────────────────────────────────
//
// Three token kinds. Each gets a figma variable in the active theme
// collection. Colors → COLOR variables; spacing/radius → FLOAT variables.
// Keys are short (sm/md/lg/primary/...) and used directly in JSX:
//   fill="primary"  gap="md"  radius="lg"
//
// Resolution is bare-name → token lookup. Raw hex (`#hex`) and raw
// numbers (`{n}`) skip the registry — they are one-off literals.

export type TokenKind = "color" | "spacing" | "radius";

export interface ThemeToken
{
    kind: TokenKind;
    key: string;
    /** hex for color, number-as-string for spacing/radius (kept as string for serialization parity) */
    value: string;
    description?: string;
}

export interface ThemeDefinition
{
    name?: string;
    tokens: ThemeToken[];
}

// Op contract for the plugin. One op for all three kinds.
export interface EnsureTokenVariablesOp
{
    type: "ensure_token_variables";
    collection: string;
    mode: string;
    themeName: string;
    tokens: Array<{
        kind: TokenKind;
        key: string;
        variableName: string;
        value: string; // hex or numeric string
        description?: string;
    }>;
}

// Backwards-compat (kept for existing call sites — emits a colors-only op).
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

// Minimal fallback ONLY if the designer returned nothing usable. This is
// a safety net, not the default — `setActiveTheme` no longer merges these
// in on top of LLM output.
const FALLBACK_TOKENS: ThemeToken[] = [
    { kind: "color",   key: "background",     value: "#F8FAFC", description: "Page background" },
    { kind: "color",   key: "surface",        value: "#FFFFFF", description: "Cards / panels" },
    { kind: "color",   key: "primary",        value: "#2563EB", description: "Primary brand / action" },
    { kind: "color",   key: "text",           value: "#0F172A", description: "Primary text" },
    { kind: "color",   key: "text-secondary", value: "#64748B", description: "Muted text" },
    { kind: "color",   key: "border",         value: "#E2E8F0", description: "Border / divider" },
    { kind: "spacing", key: "xs",             value: "4" },
    { kind: "spacing", key: "sm",             value: "8" },
    { kind: "spacing", key: "md",             value: "16" },
    { kind: "spacing", key: "lg",             value: "24" },
    { kind: "spacing", key: "xl",             value: "32" },
    { kind: "radius",  key: "sm",             value: "4" },
    { kind: "radius",  key: "md",             value: "8" },
    { kind: "radius",  key: "lg",             value: "16" },
];

let activeTheme: ThemeDefinition = { name: "fallback", tokens: FALLBACK_TOKENS };

function normalizeHex(hex: string): string
{
    const trimmed = hex.trim();
    return trimmed.startsWith("#") ? trimmed.toUpperCase() : `#${trimmed.toUpperCase()}`;
}

function normalizeKey(key: string): string
{
    return key.trim().toLowerCase();
}

/**
 * Additive theme update.
 * - On first real call (current state is the FALLBACK_TOKENS), the incoming
 *   theme replaces fallback wholesale.
 * - Subsequent calls MERGE: new keys are added; conflicting `kind:key` pairs
 *   keep the EXISTING value. This protects already-bound nodes from a
 *   second `create` run silently changing their colors/spacings while still
 *   letting the new design extend the palette with what it needs.
 *
 * Empty `theme.tokens` is a no-op (keeps current state intact).
 */
export function setActiveTheme(theme: ThemeDefinition): void
{
    if (theme.tokens.length === 0) return;

    const isFallback = activeTheme.tokens === FALLBACK_TOKENS;

    if (isFallback)
    {
        const seen = new Map<string, ThemeToken>();
        for (const t of theme.tokens)
        {
            const key = normalizeKey(t.key);
            const value = t.kind === "color" ? normalizeHex(t.value) : String(t.value).trim();
            seen.set(`${t.kind}:${key}`, { kind: t.kind, key, value, description: t.description?.trim() });
        }
        activeTheme = { name: theme.name?.trim() || "custom", tokens: [...seen.values()] };
        return;
    }

    // Merge — existing wins on collision.
    const merged = new Map<string, ThemeToken>();
    for (const t of activeTheme.tokens)
        merged.set(`${t.kind}:${normalizeKey(t.key)}`, t);

    for (const t of theme.tokens)
    {
        const key = normalizeKey(t.key);
        const lookupKey = `${t.kind}:${key}`;
        if (merged.has(lookupKey)) continue;
        const value = t.kind === "color" ? normalizeHex(t.value) : String(t.value).trim();
        merged.set(lookupKey, { kind: t.kind, key, value, description: t.description?.trim() });
    }

    activeTheme = { name: activeTheme.name, tokens: [...merged.values()] };
}

export function getActiveTheme(): ThemeDefinition
{
    return activeTheme;
}

export function variableNameFor(kind: TokenKind, key: string): string
{
    if (kind === "color") return `theme/${key}`;
    return `${kind}/${key}`;
}

/** Resolve a bare color key (e.g. "primary") to a variable-color value. */
export function resolveColorToken(key: string): VariableColorValue | undefined
{
    const k = normalizeKey(key);
    const token = activeTheme.tokens.find(t => t.kind === "color" && t.key === k);
    if (!token) return undefined;
    return {
        kind: "variable-color",
        hex: normalizeHex(token.value),
        variable: {
            collection: THEME_COLLECTION,
            mode: THEME_MODE,
            name: variableNameFor("color", token.key),
            resolvedType: "COLOR",
        },
    };
}

/** Resolve a bare numeric key (e.g. "md" for spacing) to a number + variable name. */
export function resolveNumericToken(kind: "spacing" | "radius", key: string): { value: number; variableName: string } | undefined
{
    const k = normalizeKey(key);
    const token = activeTheme.tokens.find(t => t.kind === kind && t.key === k);
    if (!token) return undefined;
    const n = Number(token.value);
    if (!Number.isFinite(n)) return undefined;
    return { value: n, variableName: variableNameFor(kind, k) };
}

export function getThemeCollection(): { collection: string; mode: string }
{
    return { collection: THEME_COLLECTION, mode: THEME_MODE };
}

/** Tokens table for prompt injection. Compact human-readable rows by kind. */
export function describeActiveTokensForPrompt(): string
{
    const colors = activeTheme.tokens.filter(t => t.kind === "color");
    const spacing = activeTheme.tokens.filter(t => t.kind === "spacing");
    const radius = activeTheme.tokens.filter(t => t.kind === "radius");

    const lines: string[] = [];
    if (colors.length > 0)
        lines.push(`Colors: ${colors.map(t => `\`${t.key}\` (${normalizeHex(t.value)})`).join(", ")}`);
    if (spacing.length > 0)
        lines.push(`Spacing: ${spacing.map(t => `\`${t.key}\` (${t.value}px)`).join(", ")}`);
    if (radius.length > 0)
        lines.push(`Radius: ${radius.map(t => `\`${t.key}\` (${t.value}px)`).join(", ")}`);
    return lines.join("\n");
}

/** Op the plugin uses to ensure all theme variables exist. */
export function createEnsureTokenVariablesOp(): EnsureTokenVariablesOp
{
    return {
        type: "ensure_token_variables",
        collection: THEME_COLLECTION,
        mode: THEME_MODE,
        themeName: activeTheme.name?.trim() || "custom",
        tokens: activeTheme.tokens.map(t => ({
            kind: t.kind,
            key: t.key,
            variableName: variableNameFor(t.kind, t.key),
            value: t.kind === "color" ? normalizeHex(t.value) : String(t.value),
            description: t.description,
        })),
    };
}

// Legacy shim — colors-only op. Kept so older op streams keep working.
export function createEnsureThemeVariablesOp(): EnsureThemeVariablesOp
{
    return {
        type: "ensure_theme_variables",
        collection: THEME_COLLECTION,
        mode: THEME_MODE,
        themeName: activeTheme.name?.trim() || "custom",
        tokens: activeTheme.tokens
            .filter(t => t.kind === "color")
            .map(t => ({
                token: t.key,
                variableName: variableNameFor("color", t.key),
                hex: normalizeHex(t.value),
                description: t.description,
            })),
    };
}

// Legacy shim — used by existing code paths to expose color token keys.
export function getAllowedThemeColorKeys(): string[]
{
    return activeTheme.tokens.filter(t => t.kind === "color").map(t => t.key);
}

// Legacy shim — same as resolveColorToken under old name.
export function resolveThemeColorValue(key: string): VariableColorValue | undefined
{
    return resolveColorToken(key);
}
