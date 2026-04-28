import { toBooleanValue, toStringValue } from "../args";
import type { ToolHandler } from "../types";
import { roleExists, saveRole } from "@/roles";

export const name = "role.save";

export const handler: ToolHandler = async (args) =>
{
    const roleName = toStringValue(args.name);
    const content = toStringValue(args.content);
    const overwrite = toBooleanValue(args.overwrite, false);

    if (!roleName || content === null)
    {
        throw new Error("Missing required args.name or args.content");
    }

    const existedBeforeSave = roleExists(roleName);
    const filePath = saveRole(roleName, content, { overwrite });

    return {
        ok: true,
        output: existedBeforeSave ? "Role overwritten" : "Role saved",
        data: {
            name: roleName,
            path: filePath,
            overwritten: existedBeforeSave,
        },
    };
};
