// ── Snapshot types ──────────────────────────────────────────────

export interface FigmaSnapshotNode
{
    id: string;
    type: string;
    name: string;
    width?: number;
    height?: number;
    x?: number;
    y?: number;
    layoutMode?: string;
    text?: string;
    visible?: boolean;
    children?: FigmaSnapshotNode[];
}

export interface FigmaPluginSnapshot
{
    source: "plugin";
    receivedAt: number;
    nodeCount: number;
    selectedNodeIds: string[];
    tree: FigmaSnapshotNode[];
    jsx: string;
    documentName?: string;
}

// ── Operation types ─────────────────────────────────────────────

export interface FigmaOp
{
    type: string;
    id?: string;
    [key: string]: unknown;
}

// ── Color types ─────────────────────────────────────────────────

export interface RGB { r: number; g: number; b: number; }
export interface RGBA extends RGB { a: number; }

export interface VariableColorValue
{
    kind: "variable-color";
    hex: string;
    variable: {
        collection: string;
        mode: string;
        name: string;
        resolvedType: "COLOR";
    };
}

export type ColorInput = string | VariableColorValue;

// ── Specific Op types ───────────────────────────────────────────

export interface EnsureColorVariablesOp extends FigmaOp
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

export interface EnsureThemeVariablesOp extends FigmaOp
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

export interface EnsureTokenVariablesOp extends FigmaOp
{
    type: "ensure_token_variables";
    collection: string;
    mode: string;
    themeName: string;
    tokens: Array<{
        kind: "color" | "spacing" | "radius";
        key: string;
        variableName: string;
        value: string; // hex for color, numeric string for spacing/radius
        description?: string;
    }>;
}

export interface EnsureTextStylesOp extends FigmaOp
{
    type: "ensure_text_styles";
    styles: Array<{
        key: string;
        name: string;
        fontFamily?: string;
        fontSize?: number;
        fontWeight?: string;
        lineHeight?: number;
        letterSpacing?: number;
    }>;
}
