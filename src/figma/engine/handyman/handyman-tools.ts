import type { ToolHandler } from "@/tools/types";
import type { JsxBuffer } from "@/figma/engine/jsx/jsx-buffer";
import { parseJsx } from "@/figma/engine/jsx/jsx-parser";
import { mapKeyToId } from "@/figma/engine/jsx/jsx-key-mapper";

function loadNodes(buffer: JsxBuffer, jsx: string, parentId?: string): void
{
    const mapped = mapKeyToId(jsx);
    const nodes = parseJsx(mapped);

    function insertNode(node: typeof nodes[0], pid: string | undefined): void
    {
        const id = String(node.props.id ?? node.props.key ?? "");

        // Preserve text content from string children into the `text` prop
        const textChild = node.children
            .filter((c): c is string => typeof c === "string")
            .map(s => s.trim())
            .filter(Boolean)
            .join(" ");

        const props: Record<string, unknown> = { ...node.props, id };
        if (textChild && !props.text && !props.content)
            props.text = textChild;

        buffer.create(node.type, props, pid);

        for (const child of node.children)
            if (typeof child === "object")
                insertNode(child, id);
    }

    for (const node of nodes)
        insertNode(node, parentId);
}

export function makeHandymanTools(buffer: JsxBuffer): Record<string, ToolHandler>
{
    const get: ToolHandler = async (args) =>
    {
        const key = String(args.key ?? "");
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
            const indent = "  ".repeat(depth);
            const textVal = n.props.text ?? n.props.content;
            const attrs = [`key="${n.id}"`, ...Object.entries(n.props)
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

        return { ok: true, output: toJsx(key, 0) };
    };

    const list: ToolHandler = async () =>
    {
        return { ok: true, output: buffer.toJsx() || "(empty)" };
    };

    const setInner: ToolHandler = async (args) =>
    {
        const key = String(args.key ?? "");
        const jsx = String(args.jsx ?? "");
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
        const key = String(args.key ?? "");
        const jsx = String(args.jsx ?? "");
        const node = buffer.get(key);
        if (!node) return { ok: false, output: `Node "${key}" not found`, error: `Node "${key}" not found` };

        const parentId = node.parentId ?? undefined;
        buffer.delete(key);

        try
        {
            loadNodes(buffer, jsx, parentId!);
            return { ok: true, output: `Node "${key}" replaced` };
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

    const create: ToolHandler = async (args) =>
    {
        const key = String(args.key ?? "");
        const name = String(args.name ?? key);
        const parentKey = args.parentKey !== undefined ? String(args.parentKey) : undefined;

        try
        {
            buffer.create("Frame", { id: key, name }, parentKey);
            return { ok: true, output: `Node "${key}" created` };
        }
        catch (err)
        {
            return { ok: false, output: String(err), error: String(err) };
        }
    };

    return {
        "figma.get": get,
        "figma.list": list,
        "figma.set-inner": setInner,
        "figma.set-outer": setOuter,
        "figma.remove": remove,
        "figma.create": create,
    };
}
