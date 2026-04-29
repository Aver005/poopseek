import { writeLine } from "../io";
import { colors } from "@/cli/colors";
import type { Command, CommandsContext } from "../types";

export function createPoetCommand(context: CommandsContext): Command
{
    return {
        name: "/poet",
        description: "Переключить режим ПОЭТ — агент отвечает в рифму",
        execute: () =>
        {
            if (!context.getPoetEnabled || !context.setPoetEnabled)
            {
                writeLine("");
                writeLine("Режим Поэта недоступен");
                writeLine("");
                return true;
            }

            const next = !context.getPoetEnabled();
            context.setPoetEnabled(next);
            writeLine("");
            if (next)
            {
                writeLine(`${colors.magenta("🎭 Режим ПОЭТ")} активирован — агент будет отвечать в рифму.`);
            }
            else
            {
                writeLine(`Режим ПОЭТ ${colors.dim("деактивирован")}.`);
            }
            writeLine("");
            return true;
        },
    };
}
