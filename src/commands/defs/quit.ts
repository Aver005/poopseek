import { createExitCommand } from "./exit";
import type { Command } from "../types";

export function createQuitCommand(rl: { close: () => void }): Command
{
    const exitCommand = createExitCommand(rl);
    return {
        ...exitCommand,
        name: "/quit",
        description: "Выйти из программы (алиас /exit)",
    };
}
