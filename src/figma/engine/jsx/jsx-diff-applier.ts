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

    changes += applyNodes(buffer, nodes, undefined);
    return { changes };
}

function applyNodes(
    buffer: JsxBuffer,
    nodes: JsxNode[],
    parentId: string | undefined,
): number
{
    let changes = 0;

    for (const node of nodes)
    {
        // `old` = node and entire subtree are preserved as-is.
        // No prop merge, no descent into children. The node is purely a
        // structural reference; any nested JSX inside is ignored.
        if (node.props.old === true) continue;

        const nodeId = String(node.props.id ?? "");
        const subChildren = node.children.filter((c): c is JsxNode => typeof c === "object");

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
        let targetId: string;

        if (existing)
        {
            // Partial prop merge: only listed props are written. Omitted props
            // stay untouched — buffer.edit ignores keys not present in `updates`.
            const { id: _, ...updates } = props;
            if (parentId !== undefined && existing.parentId !== parentId)
                updates.parentId = parentId;
            buffer.edit(existing.id, updates);
            targetId = existing.id;
        }
        else
        {
            const newNode = buffer.create(node.type, props, parentId);
            targetId = newNode.id;
        }

        changes++;

        // Listed children are processed recursively under the same rules.
        // Children NOT listed here are kept in place — deletions only happen
        // through the REMOVED list.
        if (subChildren.length > 0)
            changes += applyNodes(buffer, subChildren, targetId);
    }

    return changes;
}
