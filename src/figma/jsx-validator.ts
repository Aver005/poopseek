import { describeAllowedUtilities, isAllowedClassToken, tokenizeClassName } from "./classname";
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

function hasElementChildren(node: JsxNode): boolean
{
    return node.children.some((child) => typeof child === "object");
}

function getTextContent(node: JsxNode): string
{
    return node.children.filter((child): child is string => typeof child === "string").join("").trim();
}

function validateProps(node: JsxNode, path: string, errors: JsxValidationError[]): void
{
    const spec = getComponentSpec(node.type);
    if (!spec)
    {
        pushError(errors, node, path, `Unsupported tag <${node.type}>. Allowed tags: ${ALLOWED_TAGS.join(", ")}`);
        return;
    }

    for (const propName of Object.keys(node.props))
    {
        if (!spec.allowedProps.has(propName))
            pushError(errors, node, path, `Unsupported prop "${propName}" on <${node.type}>`);
    }
}

function validateClassNames(node: JsxNode, path: string, errors: JsxValidationError[]): void
{
    const className = node.props.className;
    if (typeof className !== "string" || className.trim().length === 0) return;

    for (const token of tokenizeClassName(className))
    {
        if (token.includes(":"))
        {
            pushError(errors, node, path, `Unsupported class "${token}". State, responsive and variant modifiers are disabled`);
            continue;
        }

        if (!isAllowedClassToken(token))
            pushError(errors, node, path, `Unsupported class "${token}". Allowed utilities: ${describeAllowedUtilities()}`);
    }
}

function validateNode(node: JsxNode, path: string, parentType: string | null, errors: JsxValidationError[]): void
{
    const spec = getComponentSpec(node.type);
    if (!spec)
    {
        pushError(errors, node, path, `Unsupported tag <${node.type}>. Allowed tags: ${ALLOWED_TAGS.join(", ")}`);
        return;
    }

    if (spec.rootOnly && parentType !== null)
        pushError(errors, node, path, `<${node.type}> is only allowed at the root level`);

    validateProps(node, path, errors);
    validateClassNames(node, path, errors);

    if (spec.noChildren && node.children.length > 0)
        pushError(errors, node, path, `<${node.type}> must not have children`);

    if (spec.textOnly && hasElementChildren(node))
        pushError(errors, node, path, `<${node.type}> accepts text children only`);

    if (node.type === "Button")
    {
        const label = node.props.label ?? node.props.text;
        if ((typeof label !== "string" || label.trim().length === 0) && getTextContent(node).length === 0)
            pushError(errors, node, path, "<Button> requires a non-empty label, text prop, or text child");
    }

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
            pushError(errors, node, path, "<Text> requires text content");
    }

    node.children.forEach((child, index) =>
    {
        if (typeof child === "string") return;
        validateNode(child, `${path} > ${child.type}[${index}]`, node.type, errors);
    });
}

export function validateJsxTree(nodes: JsxNode[]): JsxValidationError[]
{
    const errors: JsxValidationError[] = [];

    if (nodes.length === 0)
        return [{
            path: "root",
            message: "JSX tree is empty",
            loc: { index: 0, line: 1, column: 1 },
        }];

    nodes.forEach((node, index) =>
    {
        if (node.type !== "Screen")
            pushError(errors, node, `root[${index}]`, "Top-level nodes must be <Screen>");
        validateNode(node, `${node.type}[${index}]`, null, errors);
    });

    return errors;
}

export function assertValidJsx(nodes: JsxNode[]): void
{
    const errors = validateJsxTree(nodes);
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

    const summarizeFix = (message: string): string | null =>
    {
        const unsupportedClass = /Unsupported class "([^"]+)"/.exec(message)?.[1];
        if (!unsupportedClass) return null;
        if (unsupportedClass === "flex-row")
            return 'fix: use `HStack` or just `flex` instead of `flex-row`';
        if (unsupportedClass.startsWith("mx-") || unsupportedClass.startsWith("my-"))
            return "fix: replace axis margins with `gap-*`, `px-*`, `py-*`, or a wrapper Frame";
        if (unsupportedClass.startsWith("hover:") || unsupportedClass.startsWith("md:") || unsupportedClass.startsWith("sm:"))
            return "fix: remove state/responsive modifiers entirely";
        return null;
    };

    const lines = [...grouped.entries()].slice(0, 10).map(([message, items], index) =>
    {
        const samples = items.slice(0, 2).map((item) => `${item.path} @ ${item.loc.line}:${item.loc.column}`);
        const suffix = items.length > 2 ? ` (+${items.length - 2} more)` : "";
        const fix = summarizeFix(message);
        return `${index + 1}. ${message}\n   at ${samples.join("; ")}${suffix}${fix ? `\n   ${fix}` : ""}`;
    });

    return [
        "JSX validation failed. Fix all listed issues in one pass and call figma_render again with corrected JSX.",
        `Total problems: ${errors.length}. Unique issues: ${grouped.size}.`,
        ...lines,
        ...(grouped.size > 10 ? [`...and ${grouped.size - 10} more unique issues`] : []),
    ].join("\n");
}
