import type { FigmaPluginSnapshot, FigmaSnapshotNode } from "./snapshot-types";
import type { FigmaOp } from "@/figma/api/contracts";

export interface PatchPlannerInput
{
    ops: FigmaOp[];
    activeRootNodeId?: string;
    pluginSnapshot?: FigmaPluginSnapshot;
}

export interface PatchPlannerResult
{
    mode: "patched-root" | "fallback";
    ops: FigmaOp[];
    reusedRootNodeId?: string;
    incomingRootId?: string;
}

function flatten(nodes: FigmaSnapshotNode[]): FigmaSnapshotNode[]
{
    return nodes.flatMap((node) => [node, ...flatten(node.children ?? [])]);
}

function findNodeById(nodes: FigmaSnapshotNode[], id: string): FigmaSnapshotNode | undefined
{
    return flatten(nodes).find((node) => node.id === id);
}

function pickRootNode(snapshot: FigmaPluginSnapshot, activeRootNodeId?: string): FigmaSnapshotNode | undefined
{
    if (activeRootNodeId)
    {
        const activeNode = findNodeById(snapshot.tree, activeRootNodeId);
        if (activeNode) return activeNode;
    }

    for (const selectedId of snapshot.selectedNodeIds)
    {
        const selectedNode = findNodeById(snapshot.tree, selectedId);
        if (selectedNode) return selectedNode;
    }

    return snapshot.tree[0];
}

function findIncomingRootCreate(ops: FigmaOp[]): FigmaOp | undefined
{
    return ops.find((op) => op.type === "create_frame" && op.frameId === undefined);
}

function remapValue(value: unknown, from: string, to: string): unknown
{
    if (typeof value === "string")
        return value === from ? to : value;

    if (Array.isArray(value))
        return value.map((entry) => remapValue(entry, from, to));

    return value;
}

function remapRootReferences(op: FigmaOp, incomingRootId: string, existingRootId: string): FigmaOp
{
    const remapped: FigmaOp = { ...op };

    for (const key of Object.keys(remapped))
        remapped[key] = remapValue(remapped[key], incomingRootId, existingRootId);

    return remapped;
}

function buildRootPatchOps(existingRootId: string, incomingRootCreate: FigmaOp): FigmaOp[]
{
    const patchOps: FigmaOp[] = [];

    if (incomingRootCreate.name !== undefined)
        patchOps.push({ type: "rename_node", nodeId: existingRootId, name: incomingRootCreate.name });

    if (incomingRootCreate.x !== undefined || incomingRootCreate.y !== undefined)
    {
        patchOps.push({
            type: "move_node",
            nodeId: existingRootId,
            ...(incomingRootCreate.x !== undefined ? { x: incomingRootCreate.x } : {}),
            ...(incomingRootCreate.y !== undefined ? { y: incomingRootCreate.y } : {}),
        });
    }

    if (incomingRootCreate.width !== undefined || incomingRootCreate.height !== undefined)
    {
        patchOps.push({
            type: "resize_node",
            nodeId: existingRootId,
            ...(incomingRootCreate.width !== undefined ? { width: incomingRootCreate.width } : {}),
            ...(incomingRootCreate.height !== undefined ? { height: incomingRootCreate.height } : {}),
        });
    }

    if (incomingRootCreate.fill !== undefined)
        patchOps.push({ type: "set_fill", nodeId: existingRootId, color: incomingRootCreate.fill });

    if (incomingRootCreate.cornerRadius !== undefined)
    {
        patchOps.push({
            type: "set_corner_radius",
            nodeId: existingRootId,
            cornerRadius: incomingRootCreate.cornerRadius,
            ...(incomingRootCreate.cornerRadiusTopLeft !== undefined ? { cornerRadiusTopLeft: incomingRootCreate.cornerRadiusTopLeft } : {}),
            ...(incomingRootCreate.cornerRadiusTopRight !== undefined ? { cornerRadiusTopRight: incomingRootCreate.cornerRadiusTopRight } : {}),
        });
    }

    if (incomingRootCreate.clipContent !== undefined)
        patchOps.push({ type: "set_clip_content", nodeId: existingRootId, clipContent: incomingRootCreate.clipContent });

    return patchOps;
}

export function planPatchExistingRoot(input: PatchPlannerInput): PatchPlannerResult
{
    if (!input.pluginSnapshot)
        return { mode: "fallback", ops: input.ops };

    const snapshotRoot = pickRootNode(input.pluginSnapshot, input.activeRootNodeId);
    if (!snapshotRoot)
        return { mode: "fallback", ops: input.ops };

    const incomingRootCreate = findIncomingRootCreate(input.ops);
    const incomingRootId = typeof incomingRootCreate?.id === "string" ? incomingRootCreate.id : undefined;

    if (!incomingRootCreate || !incomingRootId)
        return { mode: "fallback", ops: input.ops };

    const deleteExistingChildren = (snapshotRoot.children ?? []).map((child) => ({
        type: "delete_node",
        nodeId: child.id,
    }));

    const rootPatchOps = buildRootPatchOps(snapshotRoot.id, incomingRootCreate);
    const remappedOps = input.ops
        .filter((op) => op !== incomingRootCreate)
        .map((op) => remapRootReferences(op, incomingRootId, snapshotRoot.id));

    return {
        mode: "patched-root",
        ops: [...rootPatchOps, ...deleteExistingChildren, ...remappedOps],
        reusedRootNodeId: snapshotRoot.id,
        incomingRootId,
    };
}


