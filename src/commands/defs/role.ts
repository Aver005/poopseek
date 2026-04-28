import { writeLine } from "../io";
import { colors } from "@/cli/colors";
import type { Command, CommandsContext } from "../types";

export function createRoleCommand(context: CommandsContext): Command
{
    return {
        name: "/role",
        description: "Роли: create | set <name> | list | delete <name>",
        execute: async (args) =>
        {
            const sub = args[0]?.toLowerCase();

            if (!sub || sub === "list")
            {
                const roles = context.listRoles?.() ?? [];
                const activeRole = context.getActiveRole?.() ?? null;
                writeLine("");
                if (roles.length === 0)
                {
                    writeLine("Роли не созданы. Используйте /role create чтобы создать новую роль.");
                }
                else
                {
                    writeLine(colors.cyan(`Роли (${roles.length}):`));
                    writeLine("");
                    for (const role of roles)
                    {
                        const isActive = role.name === activeRole;
                        const badge = isActive ? colors.green("[активна]") : colors.dim("[выключена]");
                        writeLine(`  ${badge} ${isActive ? colors.green(role.name) : role.name}`);
                    }
                }
                writeLine("");
                return true;
            }

            if (sub === "create")
            {
                const createRole = context.createRole;
                if (!createRole)
                {
                    writeLine("");
                    writeLine("Создание ролей недоступно в этом режиме.");
                    writeLine("");
                    return true;
                }
                await createRole();
                return true;
            }

            if (sub === "set" || sub === "activate" || sub === "run")
            {
                const roleName = args[1];
                if (!roleName)
                {
                    writeLine("");
                    writeLine("Использование: /role set <name>");
                    writeLine("");
                    return true;
                }

                const ok = context.setActiveRole?.(roleName);
                writeLine("");
                if (ok)
                {
                    writeLine(`Роль ${colors.green(roleName)} активирована.`);
                }
                else
                {
                    writeLine(`Роль ${colors.red(roleName)} не найдена.`);
                }
                writeLine("");
                return true;
            }

            if (sub === "delete" || sub === "remove")
            {
                const roleName = args[1];
                if (!roleName)
                {
                    writeLine("");
                    writeLine("Использование: /role delete <name>");
                    writeLine("");
                    return true;
                }

                const currentActive = context.getActiveRole?.() ?? null;
                if (currentActive === roleName)
                {
                    context.setActiveRole?.("");
                }

                const ok = context.deleteRole?.(roleName);
                writeLine("");
                if (ok)
                {
                    writeLine(`Роль ${colors.green(roleName)} удалена.`);
                }
                else
                {
                    writeLine(`Роль ${colors.red(roleName)} не найдена.`);
                }
                writeLine("");
                return true;
            }

            writeLine("");
            writeLine("Использование: /role [list | create | set <name> | delete <name>]");
            writeLine("");
            return true;
        },
    };
}
