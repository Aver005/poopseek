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
}
