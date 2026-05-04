import { ALLOWED_TAGS, getComponentSpec } from "./jsx-spec";
import type { JsxNode, JsxSourceLocation } from "./jsx-parser";

export interface JsxValidationError
{
    path: string;
    message: string;
    loc: JsxSourceLocation;
}

export class JsxValidationException extends Error
{
    readonly errors: JsxValidationError[];

    constructor(errors: JsxValidationError[])
    {
        super("JSX validation failed");
        this.name = "JsxValidationException";
        this.errors = errors;
    }
}

function pushError(
    errors: JsxValidationError[],
    node: JsxNode,
    path: string,
    message: string,
): void
{
    errors.push({ path, message, loc: node.loc });
}

function getTextContent(node: JsxNode): string
{
    return node.children.filter((child): child is string => typeof child === "string").join("").trim();
}

function hasElementChildren(node: JsxNode): boolean
{
    return node.children.some((child) => typeof child === "object");
}

function validateNode(node: JsxNode, path: string, errors: JsxValidationError[]): void
{
    const spec = getComponentSpec(node.type);
    if (!spec)
    {
        pushError(errors, node, path, `Unsupported tag <${node.type}>. Allowed: ${ALLOWED_TAGS.join(", ")}`);
        return;
    }

    for (const propName of Object.keys(node.props))
    {
        if (!spec.allowedProps.has(propName))
            pushError(errors, node, path, `Unsupported prop "${propName}" on <${node.type}>`);
    }

    if (spec.noChildren && (node.children.length > 0))
        pushError(errors, node, path, `<${node.type}> must not have children`);

    if (spec.textOnly && hasElementChildren(node))
        pushError(errors, node, path, `<${node.type}> accepts text children only`);

    if (node.type === "Image")
    {
        const src = node.props.src;
        if (typeof src !== "string" || src.trim().length === 0)
            pushError(errors, node, path, "<Image> requires a non-empty src prop");
    }

    if (node.type === "Text")
    {
        const content = node.props.content ?? node.props.text;
        if ((typeof content !== "string" || content.trim().length === 0) && getTextContent(node).length === 0)
            pushError(errors, node, path, "<Text> requires text content or a text child");
    }

    node.children.forEach((child, index) =>
    {
        if (typeof child === "string") return;
        validateNode(child, `${path} > ${child.type}[${index}]`, errors);
    });
}

export function validateJsxTree(nodes: JsxNode[]): JsxValidationError[]
{
    const errors: JsxValidationError[] = [];

    if (nodes.length === 0)
        return [{ path: "root", message: "JSX tree is empty", loc: { index: 0, line: 1, column: 1 } }];

    nodes.forEach((node, index) =>
        validateNode(node, `${node.type}[${index}]`, errors)
    );

    return errors;
}

export function validateJsxFragment(nodes: JsxNode[]): JsxValidationError[]
{
    const errors: JsxValidationError[] = [];

    if (nodes.length === 0)
        return [{ path: "fragment", message: "JSX fragment is empty", loc: { index: 0, line: 1, column: 1 } }];

    nodes.forEach((node, index) =>
        validateNode(node, `${node.type}[${index}]`, errors)
    );

    return errors;
}

export function assertValidJsx(nodes: JsxNode[]): void
{
    const errors = validateJsxTree(nodes);
    if (errors.length > 0) throw new JsxValidationException(errors);
}

export function assertValidJsxFragment(nodes: JsxNode[]): void
{
    const errors = validateJsxFragment(nodes);
    if (errors.length > 0) throw new JsxValidationException(errors);
}

export function formatJsxValidationErrors(errors: JsxValidationError[]): string
{
    const grouped = new Map<string, JsxValidationError[]>();

    for (const error of errors)
    {
        const bucket = grouped.get(error.message) ?? [];
        bucket.push(error);
        grouped.set(error.message, bucket);
    }

    const lines = [...grouped.entries()].slice(0, 10).map(([message, items], index) =>
    {
        const samples = items.slice(0, 2).map((item) => `${item.path} @ ${item.loc.line}:${item.loc.column}`);
        const suffix  = items.length > 2 ? ` (+${items.length - 2} more)` : "";
        return `${index + 1}. ${message}\n   at ${samples.join("; ")}${suffix}`;
    });

    return [
        "JSX validation failed. Fix all listed issues and resubmit.",
        `Total: ${errors.length}. Unique: ${grouped.size}.`,
        ...lines,
        ...(grouped.size > 10 ? [`...and ${grouped.size - 10} more`] : []),
    ].join("\n");
}
