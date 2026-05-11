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
    // NOTE: no `.trim()` — a single-space `<Text> </Text>` is intentional in
    // syntax-highlighted IDE mock-ups (separator between tokens), and the
    // builder uses it legitimately. Trimming here flagged those as "empty"
    // and the LLM had no way to "fix" because the JSX was already correct.
    return node.children.filter((child): child is string => typeof child === "string").join("");
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

    // Unknown props are NOT a hard validation error — they're logged as
    // warnings and the compiler ignores them. Forcing the LLM to retry on
    // every typo wastes time when the rest of the JSX is fine.
    if (!spec.allowExtraProps)
    {
        for (const propName of Object.keys(node.props))
        {
            if (!spec.allowedProps.has(propName))
                console.warn(`[jsx-validator] WARN unsupported prop "${propName}" on <${node.type}> at ${path} @ ${node.loc.line}:${node.loc.column} — ignored by compiler`);
        }
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

    if (node.type === "Line" || node.type === "Divider")
    {
        // Hard-fail SVG-style geometry. The compiler ignores x1/y1/x2/y2
        // and friends (they're not in LINE_PROPS), so what looks like
        // "draw a curve" in the JSX becomes invisible noise at render
        // time. Force the LLM to retry with a coherent approach
        // (placeholder image / abstract chart frame) instead of silently
        // wasting ops.
        const svgProps = ["x1", "y1", "x2", "y2", "strokeDashArray", "dashArray", "d", "points", "polyline"];
        for (const prop of svgProps)
        {
            if (node.props[prop] !== undefined)
                pushError(errors, node, path, `<Line> does not support SVG geometry props (got "${prop}"). Use <Line x=… y=… length=… vertical?/> for axis lines. For complex charts/curves, use a placeholder <Image src="https://placehold.co/...?text=Chart" /> instead.`);
        }
    }

    if (node.type === "Text")
    {
        // Whitespace-only text IS valid (e.g. single space for visual gap
        // between tokens in a syntax-highlighted code mock). Only flag
        // when there's truly nothing — no content prop AND no text child
        // characters at all.
        const content = node.props.content ?? node.props.text;
        const hasContentProp = typeof content === "string" && content.length > 0;
        const hasTextChild = getTextContent(node).length > 0;
        if (!hasContentProp && !hasTextChild)
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
