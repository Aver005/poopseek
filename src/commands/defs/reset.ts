import { writeLine } from "../io";
import type { Command, CommandsContext } from "../types";

export function createResetCommand(context: CommandsContext): Command
{
    return {
        name: "/reset",
        description: "Начать новый чат (очистить историю сообщений)",
        execute: async () =>
        {
            if (!context.resetSession)
            {
                writeLine("");
                writeLine("Ошибка: метод сброса сессии не доступен");
                writeLine("");
                return true;
            }

            const confirmed = await context.confirm?.("Начать новый чат? Вся история будет очищена.") ?? true;
            if (!confirmed)
            {
                writeLine("");
                writeLine("Отменено.");
                writeLine("");
                return true;
            }

            await context.resetSession();
            writeLine("");
            writeLine("✨ Новый чат начат! История очищена.");
            writeLine("");
            return true;
        },
    };
}

export function createRstCommand(context: CommandsContext): Command
{
    return {
        name: "/rst",
        description: "Алиас для /reset — начать новый чат",
        execute: async () =>
        {
            if (!context.resetSession)
            {
                writeLine("");
                writeLine("Ошибка: метод сброса сессии не доступен");
                writeLine("");
                return true;
            }

            const confirmed = await context.confirm?.("Начать новый чат? Вся история будет очищена.") ?? true;
            if (!confirmed)
            {
                writeLine("");
                writeLine("Отменено.");
                writeLine("");
                return true;
            }

            await context.resetSession();
            writeLine("");
            writeLine("✨ Новый чат начат! История очищена.");
            writeLine("");
            return true;
        },
    };
}

export function createNewCommand(context: CommandsContext): Command
{
    return {
        name: "/new",
        description: "Алиас для /reset — начать новый чат",
        execute: async () =>
        {
            if (!context.resetSession)
            {
                writeLine("");
                writeLine("Ошибка: метод сброса сессии не доступен");
                writeLine("");
                return true;
            }

            const confirmed = await context.confirm?.("Начать новый чат? Вся история будет очищена.") ?? true;
            if (!confirmed)
            {
                writeLine("");
                writeLine("Отменено.");
                writeLine("");
                return true;
            }

            await context.resetSession();
            writeLine("");
            writeLine("✨ Новый чат начат! История очищена.");
            writeLine("");
            return true;
        },
    };
}
