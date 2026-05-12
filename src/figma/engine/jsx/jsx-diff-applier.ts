import type { JsxBuffer } from "./jsx-buffer";
import type { JsxNode } from "./jsx-parser";
import { parseJsx } from "./jsx-parser";
import { mapKeyToId } from "./jsx-key-mapper";

export interface DiffResult
{
    changes: number;
    error?: string;
}

function collectIds(nodes: JsxNode[], out: string[]): void
{
    for (const node of nodes)
    {
        const id = String(node.props.id ?? "").trim();
        if (id) out.push(id);
        const subChildren = node.children.filter((c): c is JsxNode => typeof c === "object");
        if (subChildren.length > 0) collectIds(subChildren, out);
    }
}

function findDuplicateIds(nodes: JsxNode[]): string[]
{
    const ids: string[] = [];
    collectIds(nodes, ids);

    const seen = new Set<string>();
    const dups = new Set<string>();
    for (const id of ids)
    {
        if (seen.has(id)) dups.add(id);
        else seen.add(id);
    }
    return [...dups];
}

export function applyDiff(
    buffer: JsxBuffer,
    diffJsx: string,
    removedKeys: string[],
): DiffResult
{
    if (!diffJsx.trim())
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
        return { changes };
    }

    let nodes: JsxNode[];
    try
    {
        nodes = parseJsx(mapKeyToId(diffJsx));
    }
    catch (err)
    {
        return { changes: 0, error: `DIFF parse error: ${err instanceof Error ? err.message : String(err)}` };
    }

    const duplicates = findDuplicateIds(nodes);
    if (duplicates.length > 0)
    {
        return {
            changes: 0,
            error: `Duplicate keys in DIFF: ${duplicates.map(k => `"${k}"`).join(", ")}. `
                + `Every key in the DIFF must be globally unique. When duplicating a structure `
                + `(e.g. several similar cards), every node — including all descendants — needs a fresh key.`,
        };
    }

    let changes = 0;
    for (const key of removedKeys)
    {
        if (buffer.get(key))
        {
            buffer.delete(key);
            changes++;
        }
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

    // Track listed child ids (including `old` references) in the order they
    // appear in the diff. We use this AFTER processing this level to
    // realign the parent's children list — `buffer.create` always pushes
    // to the end, so without a reorder a new node like `<NewSection>`
    // placed before `<Footer old />` in the diff would silently land
    // AFTER Footer on the canvas.
    const listedIds: string[] = [];

    for (const node of nodes)
    {
        // `old` = node and entire subtree are preserved as-is.
        // No prop merge, no descent into children. We still record the
        // id for positional ordering.
        if (node.props.old === true)
        {
            const oldId = String(node.props.id ?? "").trim();
            if (oldId && buffer.get(oldId)) listedIds.push(oldId);
            continue;
        }

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
            // Partial prop merge: only listed props are written.
            const { id: _, ...updates } = props;
            // Single-occurrence move: if the diff places this node under a
            // different parent than where it currently lives, treat that as
            // an explicit move. Duplicate keys are blocked by validation
            // earlier, so this is unambiguous.
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

        listedIds.push(targetId);
        changes++;

        // Listed children processed recursively. Unlisted children stay put;
        // deletions only happen through REMOVED.
        if (subChildren.length > 0)
            changes += applyNodes(buffer, subChildren, targetId);
    }

    // Realign parent's children: walk the current order, replacing each
    // listed slot with the next listed-id in DIFF order. Unlisted children
    // keep their absolute positions (they're not mentioned, so the diff
    // makes no claim about them). Result: listed children obey the diff's
    // order while everything else stays where it was.
    if (parentId && listedIds.length > 0)
    {
        const parent = buffer.get(parentId);
        if (parent)
        {
            const listedSet = new Set(listedIds);
            const currentOrder = [...parent.children];
            const newOrder: string[] = [];
            let diffIndex = 0;
            for (const id of currentOrder)
            {
                if (listedSet.has(id) && diffIndex < listedIds.length)
                    newOrder.push(listedIds[diffIndex++]!);
                else
                    newOrder.push(id);
            }
            // Only commit if it actually changed (avoid spurious touchLevel1).
            let differs = false;
            for (let i = 0; i < newOrder.length; i++)
            {
                if (newOrder[i] !== currentOrder[i]) { differs = true; break; }
            }
            if (differs) buffer.reorder(parentId, newOrder);
        }
    }

    return changes;
}
