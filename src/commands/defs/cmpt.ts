import { createCompactCommand } from "./compact";
import type { Command, CommandsContext } from "../types";

export function createCmptCommand(context: CommandsContext): Command
{
    const compactCommand = createCompactCommand(context);
    return {
        ...compactCommand,
        name: "/cmpt",
        description: "Сжать историю диалога (алиас /compact)",
    };
}
