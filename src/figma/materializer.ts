import { getComponentSpec } from "./jsx-spec";
import { parseJsx, type JsxNode, type JsxPropValue } from "./jsx-parser";
import type {
    ArtifactScalar,
    CompositionNode,
    FigmaCompositionMetaArtifact,
    FigmaPrimitivesJsxArtifact,
} from "./artifact-types";

function escapeAttr(value: string): string
{
    return value.replace(/"/g, "&quot;");
}

function stringifyPropValue(value: ArtifactScalar): string
{
    return typeof value === "string" ? value : String(value);
}

function propsToJsx(props: Record<string, ArtifactScalar> | undefined): string
{
    if (!props) return "";
    const parts: string[] = [];

    for (const [key, value] of Object.entries(props))
    {
        if (value === true)
        {
            parts.push(key);
            continue;
        }

        if (value === false) continue;
        parts.push(`${key}="${escapeAttr(stringifyPropValue(value))}"`);
    }

    return parts.length > 0 ? ` ${parts.join(" ")}` : "";
}

function serializeCompositionNode(node: CompositionNode, depth: number): string
{
    const indent = "  ".repeat(depth);

    if (node.kind === "primitive")
        return `${indent}<${node.primitive}${propsToJsx(node.props)} />`;

    const children = node.children ?? [];
    const text = typeof node.text === "string" ? node.text.trim() : "";
    const hasChildren = children.length > 0;
    const hasText = text.length > 0;
    const open = `${indent}<${node.type}${propsToJsx(node.props)}>`;

    if (!hasChildren && !hasText)
        return `${indent}<${node.type}${propsToJsx(node.props)} />`;

    if (!hasChildren)
        return `${open}${text}</${node.type}>`;

    const childJsx = children.map((child) => serializeCompositionNode(child, depth + 1)).join("\n");
    const textBlock = hasText ? `${"  ".repeat(depth + 1)}${text}\n` : "";
    return `${open}\n${textBlock}${childJsx}\n${indent}</${node.type}>`;
}

export function renderCompositionInvocationJsx(artifact: FigmaCompositionMetaArtifact): string
{
    return artifact.compositionNodes.map((node) => serializeCompositionNode(node, 0)).join("\n");
}

function interpolateTemplate(template: string, props: Record<string, JsxPropValue>): string
{
    return template.replace(/\{([A-Za-z_][A-Za-z0-9_-]*)\}/g, (_match, key: string) =>
    {
        const value = props[key];
        return value === undefined ? "" : String(value);
    });
}

function cloneNode(node: JsxNode, children: Array<JsxNode | string>): JsxNode
{
    return {
        ...node,
        props: { ...node.props },
        children,
    };
}

function expandNode(
    node: JsxNode,
    primitiveTemplates: Map<string, string>,
    stack: string[],
): JsxNode[]
{
    const template = primitiveTemplates.get(node.type);
    if (template)
    {
        if (stack.includes(node.type))
            throw new Error(`Primitive expansion cycle detected: ${[...stack, node.type].join(" -> ")}`);

        const parsed = parseJsx(interpolateTemplate(template, node.props));
        return expandNodes(parsed, primitiveTemplates, [...stack, node.type]);
    }

    const children: Array<JsxNode | string> = [];
    for (const child of node.children)
    {
        if (typeof child === "string")
        {
            children.push(child);
            continue;
        }

        children.push(...expandNode(child, primitiveTemplates, stack));
    }

    return [cloneNode(node, children)];
}

export function expandCompositionToJsx(
    compositionArtifact: FigmaCompositionMetaArtifact,
    primitivesJsxArtifact: FigmaPrimitivesJsxArtifact,
): string
{
    const primitiveTemplates = new Map(primitivesJsxArtifact.entries.map((entry) => [entry.name, entry.jsx] as const));
    const invocationJsx = renderCompositionInvocationJsx(compositionArtifact);
    const parsed = parseJsx(invocationJsx);
    const expanded = expandNodes(parsed, primitiveTemplates, []);
    return stringifyJsxNodes(expanded);
}

function expandNodes(
    nodes: JsxNode[],
    primitiveTemplates: Map<string, string>,
    stack: string[],
): JsxNode[]
{
    return nodes.flatMap((node) => expandNode(node, primitiveTemplates, stack));
}

function serializeJsxProps(props: Record<string, JsxPropValue>): string
{
    const parts: string[] = [];

    for (const [key, value] of Object.entries(props))
    {
        if (value === true)
        {
            parts.push(key);
            continue;
        }

        if (value === false) continue;
        parts.push(`${key}="${escapeAttr(String(value))}"`);
    }

    return parts.length > 0 ? ` ${parts.join(" ")}` : "";
}

function stringifyJsxNode(node: JsxNode, depth: number): string
{
    const indent = "  ".repeat(depth);
    const props = serializeJsxProps(node.props);

    if (node.children.length === 0)
        return `${indent}<${node.type}${props} />`;

    if (node.children.every((child) => typeof child === "string"))
    {
        const text = node.children.filter((child): child is string => typeof child === "string").join("").trim();
        return `${indent}<${node.type}${props}>${text}</${node.type}>`;
    }

    const children = node.children.map((child) =>
    {
        if (typeof child === "string")
            return `${"  ".repeat(depth + 1)}${child}`;
        return stringifyJsxNode(child, depth + 1);
    }).join("\n");

    return `${indent}<${node.type}${props}>\n${children}\n${indent}</${node.type}>`;
}

export function stringifyJsxNodes(nodes: JsxNode[]): string
{
    return nodes.map((node) => stringifyJsxNode(node, 0)).join("\n");
}

export function assertCompositionUsesKnownSymbols(
    compositionArtifact: FigmaCompositionMetaArtifact,
    primitivesJsxArtifact: FigmaPrimitivesJsxArtifact,
): void
{
    const primitiveNames = new Set(primitivesJsxArtifact.entries.map((entry) => entry.name));

    const visit = (node: CompositionNode): void =>
    {
        if (node.kind === "primitive")
        {
            if (!primitiveNames.has(node.primitive))
                throw new Error(`Unknown primitive "${node.primitive}" in composition`);
            return;
        }

        if (!getComponentSpec(node.type))
            throw new Error(`Unknown element "${node.type}" in composition`);

        for (const child of node.children ?? [])
            visit(child);
    };

    for (const node of compositionArtifact.compositionNodes)
        visit(node);
}
