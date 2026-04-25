import { writeLine } from "../io";
import { colors } from "@/cli/colors";
import type { Command, CommandsContext } from "../types";

const PAGE_SIZE = 10;

function renderSkillsPage(
    skills: { name: string; description: string }[],
    isActive: (name: string) => boolean,
    page: number,
): void
{
    const totalPages = Math.ceil(skills.length / PAGE_SIZE) || 1;
    const clampedPage = Math.max(1, Math.min(page, totalPages));
    const start = (clampedPage - 1) * PAGE_SIZE;
    const pageSkills = skills.slice(start, start + PAGE_SIZE);

    writeLine("");
    writeLine(colors.cyan(`Навыки (страница ${clampedPage}/${totalPages}, всего ${skills.length}):`));
    writeLine("");

    for (const skill of pageSkills)
    {
        const active = isActive(skill.name);
        const badge = active ? colors.green("[активен]") : colors.dim("[выключен]");
        writeLine(`  ${badge} ${active ? colors.green(skill.name) : skill.name}`);
        if (skill.description)
        {
            writeLine(`    ${colors.dim(skill.description)}`);
        }
    }

    writeLine("");
    if (totalPages > 1)
    {
        const hints: string[] = [];
        if (clampedPage > 1) hints.push(`/skills list ${clampedPage - 1} — назад`);
        if (clampedPage < totalPages) hints.push(`/skills list ${clampedPage + 1} — вперёд`);
        writeLine(colors.dim(`  ${hints.join("   ")}`));
        writeLine("");
    }
}

export function createSkillsCommand(context: CommandsContext): Command
{
    return {
        name: "/skills",
        description: "Навыки: [list [page]] | all | reset | use <name> | off <name> | clear",
        execute: async (args) =>
        {
            const sub = args[0]?.toLowerCase();

            // /skills или /skills list [page] — интерактивный список или постраничный
            if (!sub || sub === "list")
            {
                const skills = context.getSkills?.() ?? [];
                const isActive = (name: string): boolean => context.isSkillActive?.(name) ?? false;

                // Если есть аргумент страницы — просто вывести текст
                const pageArg = sub === "list" ? parseInt(args[1] ?? "1", 10) : NaN;
                if (!isNaN(pageArg))
                {
                    if (skills.length === 0)
                    {
                        writeLine("");
                        writeLine("Навыки не найдены. Добавьте SKILL.md в .claude/skills/ или ~/.claude/skills/");
                        writeLine("");
                        return true;
                    }
                    renderSkillsPage(skills, isActive, pageArg);
                    return true;
                }

                // Без аргументов — интерактивный режим (toggle через choose)
                if (skills.length === 0)
                {
                    writeLine("");
                    writeLine("Навыки не найдены. Добавьте SKILL.md в .claude/skills/ или ~/.claude/skills/");
                    writeLine("");
                    return true;
                }

                while (true)
                {
                    const currentSkills = context.getSkills?.() ?? [];
                    const items = currentSkills.map((skill) =>
                    {
                        const active = isActive(skill.name);
                        return {
                            value: skill.name,
                            label: `${active ? colors.green("●") : colors.dim("○")} ${active ? colors.green(skill.name) : skill.name}`,
                            hint: skill.description || undefined,
                        };
                    });

                    const selected = await context.choose?.(
                        "Навыки  (Enter — вкл/выкл, Esc — выйти)",
                        items,
                    );
                    if (!selected) break;

                    if (isActive(selected))
                    {
                        context.deactivateSkill?.(selected);
                    }
                    else
                    {
                        context.activateSkill?.(selected);
                    }
                }

                writeLine("");
                const activeNames = (context.getSkills?.() ?? [])
                    .filter((s) => isActive(s.name))
                    .map((s) => s.name);
                if (activeNames.length > 0)
                {
                    writeLine(`Активные навыки: ${activeNames.map((n) => colors.green(n)).join(", ")}`);
                }
                else
                {
                    writeLine("Активных навыков нет.");
                }
                writeLine("");
                return true;
            }

            if (sub === "all")
            {
                context.activateAllSkills?.();
                const skills = context.getSkills?.() ?? [];
                writeLine("");
                if (skills.length === 0)
                {
                    writeLine("Навыков нет — нечего активировать.");
                }
                else
                {
                    writeLine(`Активированы все навыки (${skills.length}): ${skills.map((s) => colors.green(s.name)).join(", ")}`);
                }
                writeLine("");
                return true;
            }

            if (sub === "reset")
            {
                context.clearSkills?.();
                writeLine("");
                writeLine("Все навыки деактивированы.");
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
                writeLine(ok ? `Навык ${colors.green(name)} активирован.` : `Навык "${name}" не найден.`);
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
                writeLine(ok ? `Навык ${colors.dim(name)} деактивирован.` : `Навык "${name}" не был активен.`);
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
            writeLine("Использование: /skills [list [page] | all | reset | use <name> | off <name> | clear]");
            writeLine("");
            return true;
        },
    };
}
