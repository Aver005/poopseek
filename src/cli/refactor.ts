import { stdout as output } from "node:process";
import ContextManager from "@/agent/context-manager";
import AgentLoop from "@/agent/loop";
import ToolExecutor from "@/agent/tool-executor";
import { colors } from "@/cli/colors";
import { renderMarkdown } from "@/cli/markdown";
import { getToolDetail, getToolProgressMessage } from "@/cli/tool-progress-messages";
import type { ILLMProvider, ProviderCallOptions } from "@/providers";
import type { AskUserFn } from "@/tools/types";
import type { VariableProcessor } from "@/variables";

export type RefactorLevel = "easy" | "medium" | "hard" | "ultra";

const LEVEL_CONFIG: Record<RefactorLevel, {
    maxSteps: number;
    label: string;
    color: (s: string) => string;
    hint: string;
}> = {
    easy: {
        maxSteps: 24,
        label: "easy",
        color: colors.green,
        hint: "1 стратегия · быстрый win",
    },
    medium: {
        maxSteps: 56,
        label: "medium",
        color: colors.yellow,
        hint: "2–3 стратегии · коммит между ними",
    },
    hard: {
        maxSteps: 120,
        label: "hard",
        color: colors.red,
        hint: "4–6 стратегий · полная валидация",
    },
    ultra: {
        maxSteps: 240,
        label: "ultra",
        color: (s) => `\x1b[35m${s}\x1b[0m`,
        hint: "все применимые стратегии · трансформация",
    },
};

export type RefactorDeps = {
    getProvider: () => ILLMProvider;
    getCallOptions: () => ProviderCallOptions;
    getWorkspaceRoot: () => string;
    refactorPrompt: string;
    toolsPrompt: string;
    variableProcessor: VariableProcessor;
    generationIndicator: { start(): void; stop(): void };
    getAskUser: () => AskUserFn;
    setRenderEnabled: (enabled: boolean) => void;
};

function buildRefactorTask(level: RefactorLevel, focus?: string): string
{
    const focusHint = focus
        ? `\nДополнительный фокус от пользователя: ${focus}`
        : "";

    const levelInstructions: Record<RefactorLevel, string> = {
        easy: [
            "Уровень: **easy**",
            "",
            "Алгоритм:",
            "1. Быстро просканируй проект (структура, ключевые файлы)",
            "2. Оцени стратегии по каталогу, запиши скоры",
            "3. Выбери одну — максимальный impact при минимальном усилии",
            "4. Создай `todo.write` с одной задачей (сканирование уже done, стратегия — in_progress)",
            "5. Выполни стратегию полностью",
            "6. Дай краткий итог: что сделано, файлы изменены",
        ].join("\n"),

        medium: [
            "Уровень: **medium**",
            "",
            "Алгоритм:",
            "1. Просканируй проект тщательнее — читай архитектурные файлы",
            "2. Оцени стратегии, запиши скоры",
            "3. Выбери 2–3 стратегии. Исключи ★★★ если их score < 3",
            "4. Создай `todo.write` — сканирование done, первая стратегия in_progress, остальные pending",
            "5. Выполняй по одной. После каждой: проверь сборку → коммит → обнови todo",
            "6. Итоговый отчёт: стратегии + что конкретно изменилось",
        ].join("\n"),

        hard: [
            "Уровень: **hard**",
            "",
            "Алгоритм:",
            "1. Полный скан проекта: структура, крупные файлы, метрики (any, catch, размер)",
            "2. Читай ключевые модули детально",
            "3. Оцени все 12 стратегий, запиши скоры",
            "4. Выбери всё с score ≥ 2, максимум 6 стратегий",
            "5. Отсортируй по порядку зависимостей (S01→S10→S04→S05→детали→косметика)",
            "6. `todo.write` — полный план, всё pending кроме текущего",
            "7. Каждая стратегия: выполни → `bun run build` (или аналог) → `git commit` → обнови todo",
            "8. Финальный отчёт с метриками",
        ].join("\n"),

        ultra: [
            "Уровень: **ultra**",
            "",
            "Алгоритм:",
            "1. Полная археология проекта: читай ВСЕ значимые файлы, структуру, историю git",
            "2. Оцени все 12 стратегий — будь строг, score должен отражать реальность",
            "3. Выбери все с score ≥ 1",
            "4. Составь детальный план через `todo.write` — каждая стратегия = отдельная задача",
            "5. Выполняй в правильном порядке (фундамент → структура → детали → косметика)",
            "6. После каждой стратегии: сборка → тесты (если есть) → коммит → обнови todo",
            "7. Если что-то ломается — откати именно этот шаг, зафиксируй в todo как blocked",
            "8. Финальный отчёт: каждая стратегия + числовые метрики изменений",
        ].join("\n"),
    };

    return [levelInstructions[level], focusHint].filter(Boolean).join("\n");
}

export async function executeRefactor(
    level: RefactorLevel,
    focus: string | undefined,
    deps: RefactorDeps,
): Promise<void>
{
    const cfg = LEVEL_CONFIG[level];

    const refactorProvider = await deps.getProvider().clone();
    const refactorContext = new ContextManager(
        deps.refactorPrompt,
        deps.toolsPrompt,
        { maxMessages: 60 },
        deps.variableProcessor,
    );
    const refactorTool = new ToolExecutor(
        deps.getWorkspaceRoot(),
        (req) => deps.getAskUser()(req),
    );
    const callOptions = deps.getCallOptions();
    const refactorLoop = new AgentLoop(
        () => refactorProvider,
        refactorContext,
        refactorTool,
        {
            maxStepsPerTurn: cfg.maxSteps,
            maxToolsPerStep: 20,
            getCallOptions: () => ({ modelVariant: callOptions.modelVariant }),
        },
    );

    const levelTag = cfg.color(`[${cfg.label}]`);
    output.write(`\n${colors.cyan("◈ refactor")} ${levelTag} ${colors.dim("—")} ${cfg.hint}\n`);

    try
    {
        let wroteAnyChunk = false;
        await refactorLoop.runTurn(buildRefactorTask(level, focus), {
            onModelRequestStart: () => deps.generationIndicator.start(),
            onModelRequestDone: () => deps.generationIndicator.stop(),
            onAssistantChunk: (chunk) =>
            {
                deps.generationIndicator.stop();
                if (!wroteAnyChunk)
                {
                    output.write("\n");
                    wroteAnyChunk = true;
                }
                output.write(renderMarkdown(chunk));
            },
            onToolStart: (toolName, toolArgs) =>
            {
                deps.generationIndicator.stop();
                const detail = getToolDetail(toolName, toolArgs);
                const suffix = detail ? ` ${colors.dim(`(${detail})`)}` : "";
                output.write(`\n${colors.yellow(getToolProgressMessage(toolName))}${suffix}\n`);
            },
            onToolDone: (toolName, toolResult) =>
            {
                const marker = toolResult.ok ? colors.green("ok") : colors.red("not ok");
                output.write(`${colors.dim("[refactor/tool]")} ${colors.cyan(toolName)} ${marker}\n`);
            },
        });
        output.write("\n\n");
    }
    catch
    {
        deps.generationIndicator.stop();
        output.write(`${colors.red("refactor: ошибка запроса")}\n\n`);
    }
}

export function createRefactorRunner(deps: RefactorDeps): {
    runRefactor: (level: RefactorLevel, focus?: string) => Promise<void>;
}
{
    const runRefactor = async (level: RefactorLevel, focus?: string): Promise<void> =>
    {
        deps.setRenderEnabled(false);
        try
        {
            await executeRefactor(level, focus, deps);
        }
        finally
        {
            deps.setRenderEnabled(true);
        }
    };

    return { runRefactor };
}
