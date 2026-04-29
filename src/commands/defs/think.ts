import { writeLine } from "../io";
import type { Command, CommandsContext } from "../types";

export function createThinkCommand(context: CommandsContext): Command
{
    return {
        name: "/think",
        description: "Переключить режим рассуждений (thinking_enabled)",
        execute: () =>
        {
            if (!context.getThinkingEnabled || !context.setThinkingEnabled)
            {
                writeLine("");
                writeLine("Управление режимом рассуждений недоступно");
                writeLine("");
                return true;
            }

            const provider = context.getCurrentProvider?.();
            if (provider && !provider.capabilities.thinking)
            {
                writeLine("");
                writeLine(`Режим рассуждений не поддерживается провайдером ${provider.info.label}`);
                writeLine("");
                return true;
            }

            const next = !context.getThinkingEnabled();
            context.setThinkingEnabled(next);
            writeLine("");
            writeLine(`Режим рассуждений: ${next ? "включён" : "выключен"}`);
            writeLine("");
            return true;
        },
    };
}
