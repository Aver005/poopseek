import type { ToolHandler } from "@/tools/types";
import { parseJsx } from "@/figma/jsx-parser";
import { compileJsx } from "@/figma/jsx-compiler";
import { assertValidJsx, formatJsxValidationErrors, JsxValidationException } from "@/figma/jsx-validator";
import { JsxParseError } from "@/figma/jsx-parser";

export const name = "figma_render";

export const handler: ToolHandler = async (args) =>
{
    const jsx = String(args.jsx ?? args.schema ?? "").trim();
    if (!jsx) return { ok: false, output: "jsx argument is required" };

    let ops: unknown[];
    try
    {
        const nodes = parseJsx(jsx);
        assertValidJsx(nodes);
        ops = compileJsx(nodes);
    }
    catch (err)
    {
        if (err instanceof JsxParseError)
            return { ok: false, output: `JSX parse error at ${err.loc.line}:${err.loc.column} - ${err.message}` };
        if (err instanceof JsxValidationException)
            return { ok: false, output: formatJsxValidationErrors(err.errors) };
        return { ok: false, output: `JSX compile error: ${err instanceof Error ? err.message : String(err)}` };
    }

    if (ops.length === 0)
        return { ok: false, output: "No elements compiled — check your JSX structure (tags must be PascalCase)" };

    return {
        ok: true,
        output: `Compiled ${ops.length} Figma ops from JSX`,
        data: ops,
    };
};
