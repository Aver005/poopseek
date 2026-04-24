import { getToolNames } from "@/tools";
import { writeLine } from "./io";
import type { Command } from "./types";

export function createToolsCommand(): Command
{
    return {
        name: "/tools",
        description: "Показать список доступных инструментов",
        execute: async () =>
        {
            writeLine("");
            writeLine("Доступные инструменты:");
            for (const toolName of getToolNames())
            {
                writeLine(`  - ${toolName}`);
            }
            writeLine("");
            return true;
        },
    };
}
