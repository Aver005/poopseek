import { writeLine } from "../io";
import type { Command, CommandsContext } from "../types";
import type { RefactorLevel } from "@/cli/refactor";

const LEVELS = new Set<RefactorLevel>(["easy", "medium", "hard", "ultra"]);

const LEVEL_DESCRIPTIONS: Record<RefactorLevel, string> = {
    easy:   "1 стратегия, быстрый win, без коммитов",
    medium: "2–3 стратегии, коммит после каждой",
    hard:   "4–6 стратегий, сборка + коммит, полная валидация",
    ultra:  "все применимые стратегии, трансформация проекта",
};

const USAGE = [
    "",
    "Использование: /refactor <уровень> [фокус]",
    "",
    "  /refactor easy               — быстрый win: одна стратегия с макс. impact",
    "  /refactor medium             — 2–3 стратегии, коммит между ними",
    "  /refactor hard               — 4–6 стратегий, сборка + коммит",
    "  /refactor ultra              — полная трансформация, все применимые стратегии",
    "",
    "  /refactor easy types         — то же, но фокус на типах",
    "  /refactor medium src/api     — акцент на конкретной директории",
    "",
    "Каталог стратегий (агент выбирает сам по результатам анализа):",
    "  S01 · Мёртвый код           S07 · Декомпозиция функций",
    "  S02 · Магические значения   S08 · Обработка ошибок",
    "  S03 · Глубокая вложенность  S09 · Async/Promise гигиена",
    "  S04 · Типы TypeScript       S10 · Модульные границы",
    "  S05 · Дублирование          S11 · Конфигурация",
    "  S06 · Именование            S12 · Согласованность API",
    "",
].join("\n");

function isRefactorLevel(value: string): value is RefactorLevel
{
    return LEVELS.has(value as RefactorLevel);
}

export function createRefactorCommand(context: CommandsContext): Command
{
    return {
        name: "/refactor",
        description: "Рефакторинг: <easy|medium|hard|ultra> [фокус]",
        execute: async (args) =>
        {
            if (!context.runRefactor)
            {
                writeLine("");
                writeLine("Рефакторинг недоступен");
                writeLine("");
                return true;
            }

            const rawLevel = args[0]?.toLowerCase() ?? "";

            if (!rawLevel || rawLevel === "--help" || rawLevel === "help" || rawLevel === "-h")
            {
                writeLine(USAGE);
                return true;
            }

            if (!isRefactorLevel(rawLevel))
            {
                writeLine("");
                writeLine(`Неизвестный уровень: "${rawLevel}". Доступны: easy, medium, hard, ultra`);
                writeLine(USAGE);
                return true;
            }

            const level = rawLevel;
            const focus = args.slice(1).join(" ").trim() || undefined;

            writeLine("");
            writeLine(`Уровень: ${level} — ${LEVEL_DESCRIPTIONS[level]}`);
            if (focus) writeLine(`Фокус: ${focus}`);
            writeLine("");

            await context.runRefactor(level, focus);
            return true;
        },
    };
}
