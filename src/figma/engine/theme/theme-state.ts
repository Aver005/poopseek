import type { VariableColorValue } from "./design-tokens";

// ─── Token model ────────────────────────────────────────────────
//
// Four token kinds + a separate registry of named component bundles.
//
//   color      → hex      → COLOR figma variable      → fill="primary"
//   spacing    → number   → FLOAT figma variable      → gap="md"
//   radius     → number   → FLOAT figma variable      → radius="lg"
//   typography → object   → applied at compile time   → variant="h1"
//
// Components are bundles of resolved props (e.g. button-primary maps to
// fill / cornerRadius / padX / padY / fontSize…). Applied via `as=` at
// compile time — no figma variable needed since they expand to existing
// per-prop bindings.

export type TokenKind = "color" | "spacing" | "radius" | "typography";

export interface TypographyValue
{
    fontFamily?: string;
    fontSize?: number;
    fontWeight?: string;
    lineHeight?: number | string;
    letterSpacing?: number;
}

export interface ThemeToken
{
    kind: TokenKind;
    key: string;
    /** Color: hex. Spacing/radius: numeric string. Typography: TypographyValue. */
    value: string | TypographyValue;
    description?: string;
}

export interface ComponentDefinition
{
    name: string;
    /** Resolved prop bag — keys mirror DESIGN.md's component property
     *  names (backgroundColor / textColor / typography / rounded / padding /
     *  size / height / width). The compiler maps them onto JSX props at
     *  expansion time. */
    props: Record<string, string | number>;
}

export interface ThemeDefinition
{
    name?: string;
    tokens: ThemeToken[];
    components?: ComponentDefinition[];
    /** Markdown body of the source DESIGN.md — injected verbatim into
     *  builder/handyman prompts so the model sees rationale alongside
     *  numbers. */
    prose?: string;
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
function normalizeTokenValue(t: ThemeToken): string | TypographyValue
{
    if (t.kind === "color") return normalizeHex(t.value as string);
    if (t.kind === "typography") return typeof t.value === "object" ? t.value : {};
    return String(t.value).trim();
}

export function setActiveTheme(theme: ThemeDefinition): void
{
    if (theme.tokens.length === 0 && (!theme.components || theme.components.length === 0))
    {
        // Even empty token-set may carry prose updates.
        if (theme.prose) activeTheme = { ...activeTheme, prose: theme.prose };
        return;
    }

    const isFallback = activeTheme.tokens === FALLBACK_TOKENS;

    const merged = new Map<string, ThemeToken>();
    if (!isFallback)
    {
        for (const t of activeTheme.tokens)
            merged.set(`${t.kind}:${normalizeKey(t.key)}`, t);
    }

    for (const t of theme.tokens)
    {
        const key = normalizeKey(t.key);
        const lookupKey = `${t.kind}:${key}`;
        if (!isFallback && merged.has(lookupKey)) continue;
        merged.set(lookupKey, {
            kind: t.kind,
            key,
            value: normalizeTokenValue(t),
            description: t.description?.trim(),
        });
    }

    // Components: same first-wins merge behaviour.
    const componentByName = new Map<string, ComponentDefinition>();
    if (!isFallback)
    {
        for (const c of activeTheme.components ?? [])
            componentByName.set(normalizeKey(c.name), c);
    }
    for (const c of theme.components ?? [])
    {
        const k = normalizeKey(c.name);
        if (!isFallback && componentByName.has(k)) continue;
        componentByName.set(k, { name: k, props: { ...c.props } });
    }

    activeTheme = {
        name: isFallback ? (theme.name?.trim() || "custom") : activeTheme.name,
        tokens: [...merged.values()],
        components: [...componentByName.values()],
        prose: theme.prose ?? activeTheme.prose,
    };
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
        hex: normalizeHex(token.value as string),
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

/** Resolve a typography variant (e.g. "h1") to its prop bundle. */
export function resolveTypographyToken(key: string): TypographyValue | undefined
{
    const k = normalizeKey(key);
    const token = activeTheme.tokens.find(t => t.kind === "typography" && t.key === k);
    if (!token) return undefined;
    return typeof token.value === "object" ? token.value : undefined;
}

/** Resolve a component name (e.g. "button-primary") to its prop bundle. */
export function resolveComponentToken(name: string): ComponentDefinition | undefined
{
    const k = normalizeKey(name);
    return (activeTheme.components ?? []).find(c => c.name === k);
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
    const typography = activeTheme.tokens.filter(t => t.kind === "typography");
    const components = activeTheme.components ?? [];

    const lines: string[] = [];
    if (colors.length > 0)
        lines.push(`Colors: ${colors.map(t => `\`${t.key}\` (${normalizeHex(t.value as string)})`).join(", ")}`);
    if (spacing.length > 0)
        lines.push(`Spacing: ${spacing.map(t => `\`${t.key}\` (${t.value}px)`).join(", ")}`);
    if (radius.length > 0)
        lines.push(`Radius: ${radius.map(t => `\`${t.key}\` (${t.value}px)`).join(", ")}`);
    if (typography.length > 0)
        lines.push(`Typography variants: ${typography.map(t =>
        {
            const v = t.value as TypographyValue;
            const bits: string[] = [];
            if (v.fontSize !== undefined) bits.push(`${v.fontSize}px`);
            if (v.fontWeight) bits.push(String(v.fontWeight));
            return `\`${t.key}\`${bits.length ? ` (${bits.join("/")})` : ""}`;
        }).join(", ")}`);
    if (components.length > 0)
        lines.push(`Components: ${components.map(c => `\`${c.name}\``).join(", ")}`);
    return lines.join("\n");
}

/** Full DESIGN.md prose body for prompt injection. Empty string if none. */
export function getActiveDesignDoc(): string
{
    return activeTheme.prose ?? "";
}

/** Op the plugin uses to ensure all theme variables exist.
 *  Typography is compile-time-only (no figma variable yet), components
 *  are bundle-expansion-only — both excluded from this op. */
export function createEnsureTokenVariablesOp(): EnsureTokenVariablesOp
{
    return {
        type: "ensure_token_variables",
        collection: THEME_COLLECTION,
        mode: THEME_MODE,
        themeName: activeTheme.name?.trim() || "custom",
        tokens: activeTheme.tokens
            .filter(t => t.kind === "color" || t.kind === "spacing" || t.kind === "radius")
            .map(t => ({
                kind: t.kind,
                key: t.key,
                variableName: variableNameFor(t.kind, t.key),
                value: t.kind === "color" ? normalizeHex(t.value as string) : String(t.value),
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
                hex: normalizeHex(t.value as string),
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
