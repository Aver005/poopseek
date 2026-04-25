import { toStringValue } from "../args";
import type { ToolHandler } from "../types";

export const name = "git";

export const handler: ToolHandler = async (args, context) =>
{
    const command = toStringValue(args.command);
    if (!command)
    {
        throw new Error("Missing required args.command");
    }

    const kind = process.platform === "win32" ? "powershell" : "bash";
    const result = await context.runCommand(kind, {
        command: `git ${command}`,
        cwd: context.workspaceRoot,
    });

    const out = result.stdout.trim();
    const err = result.stderr.trim();
    const output = out.length > 0 ? out : err;

    return {
        ok: result.code === 0,
        output,
        data: result,
        error: result.code === 0 ? undefined : err,
    };
};
