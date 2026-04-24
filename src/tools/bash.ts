import type { ToolHandler } from "./types";

export const name = "bash";

export const handler: ToolHandler = async (args, context) =>
{
    const result = await context.runCommand("bash", args);

    return {
        ok: result.code === 0,
        output: result.stdout.trim().length > 0 ? result.stdout : result.stderr,
        data: result,
        error: result.code === 0 ? undefined : result.stderr,
    };
};
