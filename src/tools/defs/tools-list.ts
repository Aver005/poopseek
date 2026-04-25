import type { ToolHandler } from "../types";

export const name = "tools.list";

export const handler: ToolHandler = async (_args, context) =>
{
    const tools = context.getToolNames();
    const builtIn = tools.filter((t) => !t.startsWith("mcp__"));
    const mcp = tools.filter((t) => t.startsWith("mcp__"));

    return {
        ok: true,
        output: JSON.stringify({ built_in: builtIn, mcp }, null, 2),
        data: { tools, built_in: builtIn, mcp },
    };
};
