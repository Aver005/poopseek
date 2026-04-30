import type { ToolHandler } from "@/tools/types";
import { parseJsx } from "@/figma/jsx-parser";
import { compileJsx } from "@/figma/jsx-compiler";

export const name = "figma_render";

export const handler: ToolHandler = async (args) =>
{
    const jsx = String(args.jsx ?? args.schema ?? "").trim();
    if (!jsx) return { ok: false, output: "jsx argument is required" };

    let ops: unknown[];
    try
    {
        ops = compileJsx(parseJsx(jsx));
    }
    catch (err)
    {
        return { ok: false, output: `JSX parse error: ${err instanceof Error ? err.message : String(err)}` };
    }

    if (ops.length === 0)
        return { ok: false, output: "No elements compiled — check your JSX structure (tags must be PascalCase)" };

    return {
        ok: true,
        output: `Compiled ${ops.length} Figma ops from JSX`,
        data: ops,
    };
};
