import { writeLine } from "../io";
import type { Command, CommandsContext } from "../types";

export function createSkillsFolderCommand(context: CommandsContext): Command
{
    return {
        name: "/skills-folder",
        description: "Управление папками навыков: [list] | add <путь> | reset",
        execute: async (args) =>
        {
            const sub = args[0]?.toLowerCase();

            if (!sub || sub === "list")
            {
                const folders = context.getSkillFolders?.() ?? [];
                writeLine("");
                if (folders.length === 0)
                {
                    writeLine("Дополнительные папки навыков не настроены.");
                    writeLine("Используйте /skills-folder add <путь> чтобы добавить папку.");
                }
                else
                {
                    writeLine("Дополнительные папки навыков:");
                    for (const folder of folders)
                    {
                        writeLine(`  ${folder}`);
                    }
                }
                writeLine("");
                return true;
            }

            if (sub === "add")
            {
                const rawPath = args.slice(1).join(" ").replace(/^["']|["']$/g, "").trim();
                if (!rawPath)
                {
                    writeLine("");
                    writeLine("Использование: /skills-folder add <полный путь к папке>");
                    writeLine("");
                    return true;
                }
                await context.addSkillFolder?.(rawPath);
                writeLine("");
                writeLine(`Папка добавлена: ${rawPath}`);
                writeLine("Навыки переобнаружены.");
                writeLine("");
                return true;
            }

            if (sub === "reset")
            {
                await context.resetSkillFolders?.();
                writeLine("");
                writeLine("Дополнительные папки сброшены. Используются только стандартные пути.");
                writeLine("Навыки переобнаружены.");
                writeLine("");
                return true;
            }

            writeLine("");
            writeLine("Использование: /skills-folder [list | add <путь> | reset]");
            writeLine("");
            return true;
        },
    };
}
