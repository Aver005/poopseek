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
