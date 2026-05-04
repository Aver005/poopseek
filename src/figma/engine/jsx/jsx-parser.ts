export type JsxPropValue = string | number | boolean;

export interface JsxSourceLocation
{
    index: number;
    line: number;
    column: number;
}

export interface JsxNode
{
    type: string;
    props: Record<string, JsxPropValue>;
    children: (JsxNode | string)[];
    loc: JsxSourceLocation;
}

export class JsxParseError extends Error
{
    readonly loc: JsxSourceLocation;

    constructor(message: string, loc: JsxSourceLocation)
    {
        super(message);
        this.name = "JsxParseError";
        this.loc = loc;
    }
}

function getLocation(source: string, index: number): JsxSourceLocation
{
    let line = 1;
    let column = 1;

    for (let i = 0; i < index; i += 1)
    {
        if (source[i] === "\n")
        {
            line += 1;
            column = 1;
        }
        else
        {
            column += 1;
        }
    }

    return { index, line, column };
}

function coerceValue(raw: string): JsxPropValue
{
    if (raw === "true") return true;
    if (raw === "false") return false;
    const numberValue = Number(raw);
    return raw !== "" && !Number.isNaN(numberValue) ? numberValue : raw;
}

function parseAttrs(raw: string): Record<string, JsxPropValue>
{
    const result: Record<string, JsxPropValue> = {};
    const attrRe = /([A-Za-z][\w-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+))/g;
    let match: RegExpExecArray | null;

    while ((match = attrRe.exec(raw)) !== null)
    {
        const key = match[1]!;
        const value = match[2] ?? match[3] ?? match[4] ?? "";
        result[key] = coerceValue(value);
    }

    const stripped = raw.replace(/([A-Za-z][\w-]*)\s*=\s*(?:"[^"]*"|'[^']*'|\S+)/g, " ");
    const bareAttrRe = /\b([A-Za-z][\w-]*)\b/g;

    while ((match = bareAttrRe.exec(stripped)) !== null)
    {
        const key = match[1]!;
        if (!(key in result)) result[key] = true;
    }

    return result;
}

function appendChild(
    roots: JsxNode[],
    stack: JsxNode[],
    child: JsxNode | string,
): void
{
    const parent = stack.at(-1);
    if (parent)
    {
        parent.children.push(child);
        return;
    }

    if (typeof child === "string")
    {
        if (child.trim().length > 0)
            throw new Error("Text nodes are only allowed inside JSX tags");
        return;
    }

    roots.push(child);
}

function stripCurlyBlocks(input: string): string
{
    let result = "";
    let depth = 0;
    for (let i = 0; i < input.length; i++)
    {
        const ch = input[i]!;
        if (ch === "{") depth++;
        else if (ch === "}") { if (depth > 0) depth--; }
        else if (depth === 0) result += ch;
    }
    return result;
}

export function parseJsx(input: string): JsxNode[]
{
    // 1. Strip JSX block comments
    let source = input.replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
    // 2. Strip all {expr} blocks including nested ones (.map, template literals, conditions)
    source = stripCurlyBlocks(source);
    // 3. Strip lowercase HTML closing tags, keeping text content
    source = source.replace(/<\/[a-z][A-Za-z0-9]*(?:\s[^>]*)?\s*>/g, "");
    // 4. Strip lowercase HTML opening/self-closing tags, keeping text content
    source = source.replace(/<[a-z][A-Za-z0-9]*(?:\s[^>]*)?\s*\/?>/g, "");
    const roots: JsxNode[] = [];
    const stack: JsxNode[] = [];
    const tagRe = /<[^>]+>/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = tagRe.exec(source)) !== null)
    {
        const fullTag = match[0]!;
        const tagIndex = match.index;
        const before = source.slice(lastIndex, tagIndex);
        if (before.trim().length > 0)
            appendChild(roots, stack, before.trim());

        const loc = getLocation(source, tagIndex);
        const inner = fullTag.slice(1, -1).trim();
        if (inner.length === 0)
            throw new JsxParseError("Empty JSX tag is not allowed", loc);

        if (inner.startsWith("/"))
        {
            const closingTag = inner.slice(1).trim();
            const node = stack.pop();
            if (!node)
                throw new JsxParseError(`Unexpected closing tag </${closingTag}>`, loc);
            if (node.type !== closingTag)
                throw new JsxParseError(`Mismatched closing tag </${closingTag}> for <${node.type}>`, loc);
            appendChild(roots, stack, node);
        }
        else
        {
            const selfClosing = inner.endsWith("/");
            const content = selfClosing ? inner.slice(0, -1).trim() : inner;
            const tagMatch = /^([A-Z][A-Za-z0-9]*)(?:\s+([\s\S]*))?$/.exec(content);
            if (!tagMatch)
                throw new JsxParseError(`Invalid JSX tag "${fullTag}"`, loc);

            const node: JsxNode = {
                type: tagMatch[1]!,
                props: parseAttrs(tagMatch[2] ?? ""),
                children: [],
                loc,
            };

            if (selfClosing)
                appendChild(roots, stack, node);
            else
                stack.push(node);
        }

        lastIndex = tagIndex + fullTag.length;
    }

    const tail = source.slice(lastIndex).trim();
    if (tail.length > 0)
        appendChild(roots, stack, tail);

    if (stack.length > 0)
    {
        const unclosed = stack.at(-1)!;
        throw new JsxParseError(`Unclosed tag <${unclosed.type}>`, unclosed.loc);
    }

    return roots;
}
