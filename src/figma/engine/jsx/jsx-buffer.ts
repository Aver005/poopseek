export interface BufferNode
{
    id: string;
    type: string;
    props: Record<string, unknown>;
    parentId: string | null;
    children: string[];
}

export class JsxBuffer
{
    private readonly nodes = new Map<string, BufferNode>();
    private counter = 0;

    private genId(type: string): string
    {
        const prefix = type.toLowerCase().replace(/[^a-z0-9]/g, "");
        return `${prefix}_${++this.counter}`;
    }

    create(type: string, props: Record<string, unknown> = {}, parentId?: string): BufferNode
    {
        const id = (props.id as string | undefined) ?? this.genId(type);
        if (this.nodes.has(id))
            throw new Error(`Node "${id}" already exists`);
        if (parentId !== undefined && !this.nodes.has(parentId))
            throw new Error(`Parent node "${parentId}" not found`);

        const node: BufferNode = {
            id,
            type,
            props: { ...props, id },
            parentId: parentId ?? null,
            children: [],
        };

        this.nodes.set(id, node);
        if (parentId)
            this.nodes.get(parentId)!.children.push(id);

        return node;
    }

    edit(id: string, updates: Record<string, unknown>): BufferNode
    {
        const node = this.nodes.get(id);
        if (!node) throw new Error(`Node "${id}" not found`);

        if ("parentId" in updates)
        {
            const newParentId = updates.parentId as string | null;
            if (newParentId !== node.parentId)
            {
                if (node.parentId)
                {
                    const old = this.nodes.get(node.parentId);
                    if (old) old.children = old.children.filter(c => c !== id);
                }
                if (newParentId !== null)
                {
                    const np = this.nodes.get(newParentId);
                    if (!np) throw new Error(`Parent node "${newParentId}" not found`);
                    np.children.push(id);
                }
                node.parentId = newParentId;
            }
        }

        const { parentId: _, ...rest } = updates;
        for (const [key, value] of Object.entries(rest))
        {
            if (key !== "id") node.props[key] = value;
        }

        return node;
    }

    delete(id: string): void
    {
        const node = this.nodes.get(id);
        if (!node) throw new Error(`Node "${id}" not found`);

        if (node.parentId)
        {
            const parent = this.nodes.get(node.parentId);
            if (parent) parent.children = parent.children.filter(c => c !== id);
        }

        this.pruneSubtree(id);
    }

    private pruneSubtree(id: string): void
    {
        const node = this.nodes.get(id);
        if (!node) return;
        for (const childId of node.children)
            this.pruneSubtree(childId);
        this.nodes.delete(id);
    }

    get(id: string): BufferNode | undefined
    {
        return this.nodes.get(id);
    }

    list(parentId?: string): BufferNode[]
    {
        if (parentId !== undefined)
        {
            const parent = this.nodes.get(parentId);
            if (!parent) return [];
            return parent.children
                .map(cid => this.nodes.get(cid))
                .filter((n): n is BufferNode => !!n);
        }
        return Array.from(this.nodes.values());
    }

    find(filter: {
        type?: string;
        className?: string;
        text?: string;
        parentId?: string | null;
    }): BufferNode[]
    {
        let results = Array.from(this.nodes.values());

        if (filter.parentId !== undefined)
            results = results.filter(n => n.parentId === filter.parentId);
        if (filter.type)
        {
            const t = filter.type.toLowerCase();
            results = results.filter(n => n.type.toLowerCase() === t);
        }
        if (filter.className)
        {
            const cls = filter.className;
            results = results.filter(n =>
                String(n.props.className ?? "").split(/\s+/).includes(cls)
            );
        }
        if (filter.text)
        {
            const txt = filter.text.toLowerCase();
            const keys = ["text", "label", "content", "placeholder", "title"];
            results = results.filter(n =>
                keys.some(k => String(n.props[k] ?? "").toLowerCase().includes(txt))
            );
        }

        return results;
    }

    move(id: string, newParentId: string, index?: number): BufferNode
    {
        const node = this.nodes.get(id);
        if (!node) throw new Error(`Node "${id}" not found`);

        const newParent = this.nodes.get(newParentId);
        if (!newParent) throw new Error(`Parent "${newParentId}" not found`);

        // Cycle check
        let cursor: string | null = newParentId;
        while (cursor)
        {
            if (cursor === id) throw new Error(`Moving "${id}" to "${newParentId}" would create a cycle`);
            cursor = this.nodes.get(cursor)?.parentId ?? null;
        }

        if (node.parentId)
        {
            const old = this.nodes.get(node.parentId);
            if (old) old.children = old.children.filter(c => c !== id);
        }

        if (index !== undefined && index >= 0 && index < newParent.children.length)
            newParent.children.splice(index, 0, id);
        else
            newParent.children.push(id);

        node.parentId = newParentId;
        return node;
    }

    reset(): void
    {
        this.nodes.clear();
        this.counter = 0;
    }

    get size(): number
    {
        return this.nodes.size;
    }

    roots(): BufferNode[]
    {
        return Array.from(this.nodes.values()).filter(n => !n.parentId);
    }

    toJsx(): string
    {
        return this.roots().map(n => this.serializeNode(n, 0)).join("\n");
    }

    private serializeNode(node: BufferNode, depth: number): string
    {
        const indent = "  ".repeat(depth);
        const attrs = this.propsToAttrs(node);
        const tag = node.type;

        if (node.children.length > 0)
        {
            const childJsx = node.children
                .map(cid =>
                {
                    const child = this.nodes.get(cid);
                    return child ? this.serializeNode(child, depth + 1) : "";
                })
                .filter(Boolean)
                .join("\n");
            return `${indent}<${tag}${attrs}>\n${childJsx}\n${indent}</${tag}>`;
        }

        const textVal = node.props.text ?? node.props.content;
        if (textVal !== undefined && String(textVal).trim())
            return `${indent}<${tag}${attrs}>${String(textVal).trim()}</${tag}>`;

        return `${indent}<${tag}${attrs} />`;
    }

    private propsToAttrs(node: BufferNode): string
    {
        const textOnlyKeys = new Set(["text", "content"]);
        const parts: string[] = [];

        for (const [key, value] of Object.entries(node.props))
        {
            if (textOnlyKeys.has(key)) continue;
            if (value === undefined || value === null) continue;
            const s = String(value);
            parts.push(s.includes('"') ? `${key}='${s}'` : `${key}="${s}"`);
        }

        return parts.length > 0 ? " " + parts.join(" ") : "";
    }
}
