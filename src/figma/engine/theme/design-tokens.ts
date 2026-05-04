export interface ColorToken
{
    key: string;
    variableName: string;
    hex: string;
}

export interface VariableReference
{
    collection: string;
    mode: string;
    name: string;
    resolvedType: "COLOR";
}

export interface VariableColorValue
{
    kind: "variable-color";
    hex: string;
    variable: VariableReference;
}

export interface EnsureColorVariablesOp
{
    type: "ensure_color_variables";
    collection: string;
    mode: string;
    tokens: Array<{
        key: string;
        name: string;
        hex: string;
    }>;
}

export const FIGMA_COLOR_COLLECTION = "PoopSeek Colors";
export const FIGMA_COLOR_MODE = "Light";

const TOKENS = [
    ["transparent", "color/transparent", "#FFFFFF00"],
    ["white", "color/white", "#FFFFFF"],
    ["black", "color/black", "#000000"],
    ["slate-50", "color/slate/50", "#F8FAFC"],
    ["slate-100", "color/slate/100", "#F1F5F9"],
    ["slate-200", "color/slate/200", "#E2E8F0"],
    ["slate-300", "color/slate/300", "#CBD5E1"],
    ["slate-400", "color/slate/400", "#94A3B8"],
    ["slate-500", "color/slate/500", "#64748B"],
    ["slate-600", "color/slate/600", "#475569"],
    ["slate-700", "color/slate/700", "#334155"],
    ["slate-900", "color/slate/900", "#0F172A"],
    ["gray-500", "color/gray/500", "#6B7280"],
    ["blue-50", "color/blue/50", "#EFF6FF"],
    ["blue-100", "color/blue/100", "#DBEAFE"],
    ["blue-500", "color/blue/500", "#3B82F6"],
    ["blue-600", "color/blue/600", "#2563EB"],
    ["blue-700", "color/blue/700", "#1D4ED8"],
    ["green-50", "color/green/50", "#ECFDF5"],
    ["green-100", "color/green/100", "#DCFCE7"],
    ["green-500", "color/green/500", "#10B981"],
    ["yellow-100", "color/yellow/100", "#FEF9C3"],
    ["yellow-300", "color/yellow/300", "#FDE047"],
    ["amber-50", "color/amber/50", "#FFFBEB"],
    ["amber-300", "color/amber/300", "#FCD34D"],
    ["amber-500", "color/amber/500", "#F59E0B"],
    ["orange-400", "color/orange/400", "#FB923C"],
    ["purple-50", "color/purple/50", "#FAF5FF"],
    ["purple-100", "color/purple/100", "#F3E8FF"],
    ["purple-500", "color/purple/500", "#A855F7"],
    ["purple-700", "color/purple/700", "#7E22CE"],
    ["red-50", "color/red/50", "#FEF2F2"],
    ["red-100", "color/red/100", "#FEE2E2"],
    ["red-500", "color/red/500", "#EF4444"],
] as const satisfies readonly (readonly [string, string, string])[];

export const COLOR_TOKENS: Record<string, ColorToken> = Object.fromEntries(
    TOKENS.map(([key, variableName, hex]) =>
        [
            key,
            {
                key,
                variableName,
                hex,
            } satisfies ColorToken,
        ]),
) as Record<string, ColorToken>;

export const COLOR_TOKEN_KEYS = Object.keys(COLOR_TOKENS);

export function getColorToken(key: string): ColorToken | undefined
{
    return COLOR_TOKENS[key];
}

export function createVariableColorValue(key: string): VariableColorValue
{
    const token = getColorToken(key);
    if (!token) throw new Error(`Unknown color token "${key}"`);

    return {
        kind: "variable-color",
        hex: token.hex,
        variable: {
            collection: FIGMA_COLOR_COLLECTION,
            mode: FIGMA_COLOR_MODE,
            name: token.variableName,
            resolvedType: "COLOR",
        },
    };
}

export function createEnsureColorVariablesOp(): EnsureColorVariablesOp
{
    return {
        type: "ensure_color_variables",
        collection: FIGMA_COLOR_COLLECTION,
        mode: FIGMA_COLOR_MODE,
        tokens: Object.values(COLOR_TOKENS).map((token) => ({
            key: token.key,
            name: token.variableName,
            hex: token.hex,
        })),
    };
}
