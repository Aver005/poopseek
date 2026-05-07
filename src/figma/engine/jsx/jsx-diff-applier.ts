import type { JsxBuffer } from "./jsx-buffer";
import type { JsxNode } from "./jsx-parser";
import { parseJsx } from "./jsx-parser";
import { mapKeyToId } from "./jsx-key-mapper";

export interface DiffResult
{
    changes: number;
}

export function applyDiff(
    buffer: JsxBuffer,
    diffJsx: string,
    removedKeys: string[],
): DiffResult
{
    let changes = 0;

    for (const key of removedKeys)
    {
        if (buffer.get(key))
        {
            buffer.delete(key);
            changes++;
        }
    }

    if (!diffJsx.trim()) return { changes };

    let nodes: JsxNode[];
    try
    {
        nodes = parseJsx(mapKeyToId(diffJsx));
    }
    catch
    {
        return { changes };
    }

    changes += applyNodes(buffer, nodes, undefined, false);
    return { changes };
}

function applyNodes(
    buffer: JsxBuffer,
    nodes: JsxNode[],
    parentId: string | undefined,
    reconcile: boolean,
): number
{
    let changes = 0;
    const orderedIds: string[] = [];

    for (const node of nodes)
    {
        const nodeId = String(node.props.id ?? "");
        const isOld = node.props.old === true;
        const subChildren = node.children.filter((c): c is JsxNode => typeof c === "object");

        if (isOld)
        {
            if (!nodeId) continue;
            const existing = buffer.get(nodeId);
            if (!existing) continue;
            orderedIds.push(existing.id);

            if (subChildren.length > 0)
                changes += applyNodes(buffer, subChildren, existing.id, true);
            // old + no children = skip entire subtree
        }
        else
        {
            const textContent = node.children
                .filter((c): c is string => typeof c === "string")
                .map(s => s.trim())
                .filter(Boolean)
                .join(" ");

            const props: Record<string, unknown> = { ...node.props };
            delete props.old;
            if (textContent && !props.text && !props.content)
                props.text = textContent;

            const existing = nodeId ? buffer.get(nodeId) : undefined;

            if (existing)
            {
                const { id: _, ...updates } = props;
                // Auto-move: if the node appears under a different parent in the diff,
                // move it rather than leaving it in the old parent (which would cause
                // deletion when the old parent is reconciled).
                if (parentId !== undefined && existing.parentId !== parentId)
                    updates.parentId = parentId;
                buffer.edit(existing.id, updates);
                orderedIds.push(existing.id);
                changes++;
            }
            else
            {
                const newNode = buffer.create(node.type, props, parentId);
                orderedIds.push(newNode.id);
                changes++;
            }

            if (subChildren.length > 0)
            {
                const targetId = existing ? existing.id : orderedIds[orderedIds.length - 1]!;
                // changed container: reconcile children
                changes += applyNodes(buffer, subChildren, targetId, true);
            }
        }
    }

    // Reconcile only when inside a changed (no-old) container.
    // Deletes buffer children that weren't listed in the diff, then reorders.
    if (reconcile && parentId)
    {
        const parent = buffer.get(parentId);
        if (parent)
        {
            const listed = new Set(orderedIds);
            for (const childId of [...parent.children])
            {
                if (!listed.has(childId) && buffer.get(childId))
                    buffer.delete(childId);
            }
        }
        if (orderedIds.length > 0)
            buffer.reorder(parentId, orderedIds);
    }

    return changes;
}
