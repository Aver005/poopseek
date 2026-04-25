import { writeLine } from "../io";
import type { Command, CommandsContext } from "../types";

export function createSkillsCommand(context: CommandsContext): Command
{
    return {
        name: "/skills",
        description: "Управление навыками: list | use <name> | off <name> | clear",
        execute: async (args) =>
        {
            const sub = args[0]?.toLowerCase();

            if (!sub || sub === "list")
            {
                const skills = context.getSkills?.() ?? [];
                writeLine("");
                if (skills.length === 0)
                {
                    writeLine("Навыки не найдены. Добавьте SKILL.md в .claude/skills/ или ~/.claude/skills/");
                }
                else
                {
                    writeLine("Доступные навыки:");
                    for (const skill of skills)
                    {
                        const active = context.isSkillActive?.(skill.name) ? " [активен]" : "";
                        writeLine(`  ${skill.name}${active}`);
                        if (skill.description)
                        {
                            writeLine(`    ${skill.description}`);
                        }
                    }
                }
                writeLine("");
                return true;
            }

            if (sub === "use")
            {
                const name = args[1];
                if (!name)
                {
                    writeLine("");
                    writeLine("Использование: /skills use <name>");
                    writeLine("");
                    return true;
                }
                const ok = context.activateSkill?.(name);
                writeLine("");
                writeLine(ok ? `Навык "${name}" активирован.` : `Навык "${name}" не найден.`);
                writeLine("");
                return true;
            }

            if (sub === "off")
            {
                const name = args[1];
                if (!name)
                {
                    writeLine("");
                    writeLine("Использование: /skills off <name>");
                    writeLine("");
                    return true;
                }
                const ok = context.deactivateSkill?.(name);
                writeLine("");
                writeLine(ok ? `Навык "${name}" деактивирован.` : `Навык "${name}" не был активен.`);
                writeLine("");
                return true;
            }

            if (sub === "clear")
            {
                context.clearSkills?.();
                writeLine("");
                writeLine("Все навыки деактивированы.");
                writeLine("");
                return true;
            }

            writeLine("");
            writeLine("Использование: /skills [list | use <name> | off <name> | clear]");
            writeLine("");
            return true;
        },
    };
}
