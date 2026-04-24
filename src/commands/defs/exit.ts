import { writeLine } from "./io";
import type { Command } from "./types";

export function createExitCommand(rl: { close: () => void }): Command
{
    return {
        name: "/exit",
        description: "Выйти из программы",
        execute: async () =>
        {
            writeLine("Выход...");
            rl.close();
            return false;
        },
    };
}
