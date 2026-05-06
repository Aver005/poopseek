import type { ToolHandler } from "@/tools/types";
import type { JsxBuffer } from "@/figma/engine/jsx/jsx-buffer";
import { parseJsx } from "@/figma/engine/jsx/jsx-parser";
import { mapKeyToId } from "@/figma/engine/jsx/jsx-key-mapper";

function makeUniqueId(buffer: JsxBuffer, base: string): string
{
    if (!buffer.get(base)) return base;
    let n = 2;
    while (buffer.get(`${base}_${n}`)) n++;
    return `${base}_${n}`;
}

export function loadNodesIntoBuffer(buffer: JsxBuffer, jsx: string, parentId?: string): void
{
    loadNodes(buffer, jsx, parentId);
}

function loadNodes(buffer: JsxBuffer, jsx: string, parentId?: string): void
{
    const mapped = mapKeyToId(jsx);
    const nodes = parseJsx(mapped);

    function insertNode(node: typeof nodes[0], pid: string | undefined): void
    {
        // Priority: explicit id/key (from handyman JSX via mapKeyToId), then name, then auto-generate
        const explicitId = String(node.props.id ?? "").trim();
        const nameId     = String(node.props.name ?? "").trim();
        const baseId     = explicitId || nameId;
        const resolvedId = baseId ? makeUniqueId(buffer, baseId) : "";

        const textChild = node.children
            .filter((c): c is string => typeof c === "string")
            .map(s => s.trim())
            .filter(Boolean)
            .join(" ");

        const props: Record<string, unknown> = { ...node.props };
        if (resolvedId) props.id = resolvedId;
        if (textChild && !props.text && !props.content)
            props.text = textChild;

        const created = buffer.create(node.type, props, pid);

        for (const child of node.children)
            if (typeof child === "object")
                insertNode(child, created.id);
    }

    for (const node of nodes)
        insertNode(node, parentId);
}

function fencedJsx(jsx: string): string
{
    return `\`\`\`jsx\n${jsx}\n\`\`\``;
}

export function makeHandymanTools(buffer: JsxBuffer): Record<string, ToolHandler>
{
    const get: ToolHandler = async (args) =>
    {
        const key  = String(args.key ?? "");
        const node = buffer.get(key);
        if (!node) return { ok: false, output: `Node "${key}" not found`, error: `Node "${key}" not found` };

        function renderAttr(k: string, v: unknown): string
        {
            if (v === true) return k;
            if (v === false || v === undefined || v === null) return "";
            if (typeof v === "number") return `${k}={${v}}`;
            const s = String(v);
            return s.includes('"') ? `${k}='${s}'` : `${k}="${s}"`;
        }

        function toJsx(id: string, depth: number): string
        {
            const n = buffer.get(id);
            if (!n) return "";
            const indent  = "  ".repeat(depth);
            const textVal = n.props.text ?? n.props.content;
            const attrs   = [`key="${n.id}"`, ...Object.entries(n.props)
                .filter(([k]) => k !== "id" && k !== "text" && k !== "content")
                .map(([k, v]) => renderAttr(k, v))
                .filter(Boolean)].join(" ");
            const tag = n.type;
            if (n.children.length === 0 && textVal !== undefined && String(textVal).trim())
                return `${indent}<${tag} ${attrs}>${String(textVal).trim()}</${tag}>`;
            if (n.children.length === 0)
                return `${indent}<${tag} ${attrs} />`;
            const children = n.children.map(cid => toJsx(cid, depth + 1)).join("\n");
            return `${indent}<${tag} ${attrs}>\n${children}\n${indent}</${tag}>`;
        }

        return { ok: true, output: fencedJsx(toJsx(key, 0)) };
    };

    const list: ToolHandler = async () =>
    {
        const jsx = buffer.toJsx();
        return { ok: true, output: jsx ? fencedJsx(jsx) : "(empty)" };
    };

    const setInner: ToolHandler = async (args) =>
    {
        const key  = String(args.key ?? "");
        const jsx  = String(args.jsx ?? "");
        const node = buffer.get(key);
        if (!node) return { ok: false, output: `Node "${key}" not found`, error: `Node "${key}" not found` };

        for (const childId of [...node.children])
            buffer.delete(childId);

        try
        {
            loadNodes(buffer, jsx, key);
            return { ok: true, output: `Children of "${key}" replaced` };
        }
        catch (err)
        {
            return { ok: false, output: String(err), error: String(err) };
        }
    };

    const setOuter: ToolHandler = async (args) =>
    {
        const key  = String(args.key ?? "");
        const jsx  = String(args.jsx ?? "");
        const node = buffer.get(key);
        if (!node) return { ok: false, output: `Node "${key}" not found`, error: `Node "${key}" not found` };

        const parentId = node.parentId ?? undefined;

        let savedIndex: number | undefined;
        if (parentId)
        {
            const parent = buffer.get(parentId);
            if (parent) savedIndex = parent.children.indexOf(key);
        }

        buffer.delete(key);

        try
        {
            const siblingsLen = parentId ? (buffer.get(parentId)?.children.length ?? 0) : 0;
            loadNodes(buffer, jsx, parentId);

            if (savedIndex !== undefined && savedIndex < siblingsLen && parentId)
            {
                const parent = buffer.get(parentId);
                if (parent)
                {
                    const inserted = parent.children.splice(siblingsLen);
                    parent.children.splice(savedIndex, 0, ...inserted);
                }
            }

            return { ok: true, output: `Node "${key}" replaced` };
        }
        catch (err)
        {
            return { ok: false, output: String(err), error: String(err) };
        }
    };

    const patch: ToolHandler = async (args) =>
    {
        const key   = String(args.key ?? "");
        const props = (typeof args.props === "object" && args.props !== null)
            ? args.props as Record<string, unknown>
            : {};

        try
        {
            buffer.edit(key, props);
            return { ok: true, output: `Props of "${key}" updated` };
        }
        catch (err)
        {
            return { ok: false, output: String(err), error: String(err) };
        }
    };

    const remove: ToolHandler = async (args) =>
    {
        const key = String(args.key ?? "");
        try
        {
            buffer.delete(key);
            return { ok: true, output: `Node "${key}" removed` };
        }
        catch (err)
        {
            return { ok: false, output: String(err), error: String(err) };
        }
    };

    const insert: ToolHandler = async (args) =>
    {
        const jsx       = String(args.jsx ?? "");
        const parentKey = args.parentKey !== undefined ? String(args.parentKey) : undefined;
        const index     = args.index !== undefined ? Number(args.index) : undefined;

        if (!jsx.trim())
            return { ok: false, output: "jsx is required", error: "jsx is required" };

        const parentNode = parentKey ? buffer.get(parentKey) : undefined;
        if (parentKey && !parentNode)
            return { ok: false, output: `Parent "${parentKey}" not found`, error: `Parent "${parentKey}" not found` };

        try
        {
            const priorChildCount = parentNode?.children.length ?? 0;
            loadNodes(buffer, jsx, parentKey);

            if (index !== undefined && parentNode)
            {
                const added = parentNode.children.slice(priorChildCount);
                parentNode.children.splice(priorChildCount, added.length);
                parentNode.children.splice(Math.min(index, priorChildCount), 0, ...added);
            }

            return { ok: true, output: `Nodes inserted under "${parentKey ?? "root"}"` };
        }
        catch (err)
        {
            return { ok: false, output: String(err), error: String(err) };
        }
    };

    const move: ToolHandler = async (args) =>
    {
        const key          = String(args.key ?? "");
        const newParentKey = String(args.newParentKey ?? "");
        const index        = args.index !== undefined ? Number(args.index) : undefined;

        try
        {
            buffer.move(key, newParentKey, index);
            return { ok: true, output: `Node "${key}" moved to "${newParentKey}"${index !== undefined ? ` at index ${index}` : ""}` };
        }
        catch (err)
        {
            return { ok: false, output: String(err), error: String(err) };
        }
    };

    const find: ToolHandler = async (args) =>
    {
        const filter: Parameters<typeof buffer.find>[0] = {};
        if (args.type)      filter.type      = String(args.type);
        if (args.text)      filter.text      = String(args.text);
        if (args.parentKey !== undefined)
            filter.parentId = args.parentKey === null ? null : String(args.parentKey);

        const results = buffer.find(filter);
        if (results.length === 0) return { ok: true, output: "(no results)" };

        const lines = results.map(n =>
        {
            const textVal = n.props.text ?? n.props.content;
            const preview = textVal ? ` text="${String(textVal).slice(0, 60)}"` : "";
            return `key="${n.id}" type="${n.type}" parent="${n.parentId ?? "root"}"${preview}`;
        });

        return { ok: true, output: lines.join("\n") };
    };

    const children: ToolHandler = async (args) =>
    {
        const key  = String(args.key ?? "");
        const node = buffer.get(key);
        if (!node) return { ok: false, output: `Node "${key}" not found`, error: `Node "${key}" not found` };

        if (node.children.length === 0) return { ok: true, output: "(no children)" };

        const lines = node.children.map(childId =>
        {
            const child = buffer.get(childId);
            if (!child) return `"${childId}" (missing)`;
            const textVal = child.props.text ?? child.props.content;
            const preview = textVal ? ` → "${String(textVal).slice(0, 40)}"` : "";
            const childCount = child.children.length > 0 ? ` [${child.children.length} children]` : "";
            return `key="${childId}" type="${child.type}"${preview}${childCount}`;
        });

        return { ok: true, output: lines.join("\n") };
    };

    return {
        "figma.get":       get,
        "figma.list":      list,
        "figma.find":      find,
        "figma.children":  children,
        "figma.patch":     patch,
        "figma.set-inner": setInner,
        "figma.set-outer": setOuter,
        "figma.insert":    insert,
        "figma.move":      move,
        "figma.remove":    remove,
    };
}
