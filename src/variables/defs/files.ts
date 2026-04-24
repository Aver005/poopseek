import fs from "node:fs";
import path from "node:path";
import type { VariableModule } from "../types";

const MAX_FILES = 10;

function formatEntry(entry: fs.Dirent): string
{
    return entry.isDirectory() ? `${entry.name}/` : entry.name;
}

export const filesVariable: VariableModule = {
    key: "files",
    resolve: (context) =>
    {
        try
        {
            const entries = fs
                .readdirSync(path.resolve(context.workspaceRoot), {
                    withFileTypes: true,
                })
                .slice(0, MAX_FILES);
            if (entries.length === 0) return "(empty)";
            return entries.map((entry) => `- ${formatEntry(entry)}`).join("\n");
        }
        catch
        {
            return "(unavailable)";
        }
    },
};
