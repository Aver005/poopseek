import { write } from "./io";
import type { Command } from "./types";

export function createClearCommand(): Command
{
    return {
        name: "/clear",
        description: "Очистить экран",
        execute: async () =>
        {
            write("\x1b[2J\x1b[H");
            return true;
        },
    };
}
