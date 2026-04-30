export interface JsxNode
{
    type: string;
    props: Record<string, string | number | boolean>;
    children: (JsxNode | string)[];
}

function parseAttrs(raw: string): Record<string, string | number | boolean>
{
    const result: Record<string, string | number | boolean> = {};
    const re = /([\w-]+)=(?:"([^"]*)"|'([^']*)'|(\S+))/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(raw)) !== null)
    {
        const key = m[1]!;
        const val = m[2] ?? m[3] ?? m[4] ?? "";
        if (val === "true")       result[key] = true;
        else if (val === "false") result[key] = false;
        else
        {
            const n = Number(val);
            result[key] = (!isNaN(n) && val !== "") ? n : val;
        }
    }
    return result;
}

export function parseJsx(input: string): JsxNode[]
{
    // Normalise JSX expressions: attr={value} → attr="value"
    const src = input.replace(/=\{([^}]*)\}/g, '="$1"');

    // Match PascalCase tags only (our component vocabulary)
    const tagRe = /<(\/?)([A-Z][A-Za-z0-9]*)((?:\s[^>]*?)?)\s*(\/?)>/g;
    const stack: JsxNode[] = [];
    const roots: JsxNode[] = [];
    let last = 0;
    let m: RegExpExecArray | null;

    while ((m = tagRe.exec(src)) !== null)
    {
        const [full, closing, tag, attrs, selfClose] = m;
        const before = src.slice(last, m.index).trim();
        if (before) (stack.at(-1)?.children ?? roots as (JsxNode | string)[]).push(before);
        last = m.index + full!.length;

        if (closing)
        {
            const node = stack.pop();
            if (node) (stack.at(-1)?.children ?? roots as (JsxNode | string)[]).push(node);
        }
        else
        {
            const node: JsxNode = { type: tag!, props: parseAttrs(attrs ?? ""), children: [] };
            if (selfClose) (stack.at(-1)?.children ?? roots as (JsxNode | string)[]).push(node);
            else           stack.push(node);
        }
    }

    // Flush unclosed tags
    while (stack.length > 1) stack.at(-2)!.children.push(stack.pop()!);
    if (stack.length === 1) roots.push(stack[0]!);

    return roots;
}
