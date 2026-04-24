import type { ToolHandler } from "../types";

export const name = "tools.list";

export const handler: ToolHandler = async (_args, context) =>
{
    const tools = context.getToolNames();

    return {
        ok: true,
        output: JSON.stringify({ tools }, null, 2),
        data: { tools },
    };
};
