import { writeLine } from "../io";
import type { Command, CommandsContext } from "../types";

export function createLogoutCommand(context: CommandsContext): Command
{
    return {
        name: "/logout",
        description: "Сбросить токен и выйти из приложения",
        execute: async () =>
        {
            await context.logout?.();
            return false;
        },
    };
}

export function createReloginCommand(context: CommandsContext): Command
{
    return {
        name: "/relogin",
        description: "Ввести новый токен без перезапуска",
        execute: async () =>
        {
            if (!context.relogin)
            {
                writeLine("");
                writeLine("Переавторизация недоступна.");
                writeLine("");
                return true;
            }
            await context.relogin();
            return true;
        },
    };
}
