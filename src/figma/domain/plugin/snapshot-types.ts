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

export interface ThemeTokenSnapshot
{
    kind: "color" | "spacing" | "radius";
    key: string;
    /** Color: hex (#RRGGBB). Spacing/radius: numeric string. */
    value: string;
    variableName: string;
}

export interface TextStyleSnapshot
{
    key: string;
    fontFamily?: string;
    fontSize?: number;
    fontWeight?: string;
    lineHeight?: number;
    letterSpacing?: number;
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
    /** Live snapshot of the "PoopSeek Theme" variable collection. Server uses
     *  this to keep its in-memory activeTheme in sync with Figma — so token
     *  bindings survive server restarts. */
    tokens?: ThemeTokenSnapshot[];
    /** Live snapshot of local TEXT styles (typography variants). */
    textStyles?: TextStyleSnapshot[];
}
