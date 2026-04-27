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

export type ReviewScope =
    | { kind: "all" }
    | { kind: "staged" }
    | { kind: "branch"; base: string }
    | { kind: "file"; path: string }
    | { kind: "commit"; ref: string };

export type ReviewDeps = {
    getProvider: () => ILLMProvider;
    getCallOptions: () => ProviderCallOptions;
    getWorkspaceRoot: () => string;
    reviewPrompt: string;
    toolsPrompt: string;
    variableProcessor: VariableProcessor;
    generationIndicator: { start(): void; stop(): void };
    getAskUser: () => AskUserFn;
    setRenderEnabled: (enabled: boolean) => void;
};

function buildReviewTask(scope: ReviewScope): string
{
    switch (scope.kind)
    {
        case "all":
            return [
                "Выполни ревью текущих изменений.",
                "",
                "Получи diff командой `git diff HEAD` (включает и staged и unstaged).",
                "Если изменений нет — проверь `git diff --staged` и `git status`.",
                "Перед анализом запусти `git diff --stat HEAD` чтобы увидеть общую картину.",
            ].join("\n");

        case "staged":
            return [
                "Выполни ревью staged (подготовленных к коммиту) изменений.",
                "",
                "Получи diff командой `git diff --staged`.",
                "Перед анализом запусти `git diff --staged --stat` чтобы увидеть общую картину.",
            ].join("\n");

        case "branch":
            return [
                `Выполни ревью всей ветки относительно \`${scope.base}\`.`,
                "",
                `Получи diff командой \`git diff ${scope.base}...HEAD\`.`,
                `Перед анализом: \`git log --oneline ${scope.base}...HEAD\` (список коммитов) и \`git diff --stat ${scope.base}...HEAD\` (общая картина).`,
            ].join("\n");

        case "file":
            return [
                `Выполни ревью изменений в файле \`${scope.path}\`.`,
                "",
                `Получи diff командой \`git diff HEAD -- ${scope.path}\`.`,
                `Если файл новый: \`git diff --staged -- ${scope.path}\`.`,
            ].join("\n");

        case "commit":
            return [
                `Выполни ревью коммита \`${scope.ref}\`.`,
                "",
                `Получи diff командой \`git show ${scope.ref}\`.`,
            ].join("\n");
    }
}

function scopeLabel(scope: ReviewScope): string
{
    switch (scope.kind)
    {
        case "all": return "все изменения";
        case "staged": return "staged";
        case "branch": return `ветка vs ${scope.base}`;
        case "file": return scope.path;
        case "commit": return scope.ref;
    }
}

export async function executeReview(scope: ReviewScope, deps: ReviewDeps): Promise<void>
{
    const reviewProvider = await deps.getProvider().clone();
    const reviewContext = new ContextManager(
        deps.reviewPrompt,
        deps.toolsPrompt,
        { maxMessages: 20 },
        deps.variableProcessor,
    );
    const reviewTool = new ToolExecutor(deps.getWorkspaceRoot(), (req) => deps.getAskUser()(req));
    const callOptions = deps.getCallOptions();
    const reviewLoop = new AgentLoop(
        () => reviewProvider,
        reviewContext,
        reviewTool,
        {
            maxStepsPerTurn: 16,
            getCallOptions: () => ({ modelVariant: callOptions.modelVariant }),
        },
    );

    const label = scopeLabel(scope);
    output.write(`\n${colors.cyan("◈ review")} ${colors.dim("—")} ${label}\n`);

    try
    {
        let wroteAnyChunk = false;
        await reviewLoop.runTurn(buildReviewTask(scope), {
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
                const marker = toolResult.ok ? colors.green("ok=true") : colors.red("ok=false");
                output.write(`${colors.dim("[review/tool]")} ${colors.cyan(toolName)} ${marker}\n`);
            },
        });
        output.write("\n\n");
    }
    catch
    {
        deps.generationIndicator.stop();
        output.write(`${colors.red("review: ошибка запроса")}\n\n`);
    }
}

export function createReviewRunner(deps: ReviewDeps): {
    runReview: (scope: ReviewScope) => Promise<void>;
}
{
    const runReview = async (scope: ReviewScope): Promise<void> =>
    {
        deps.setRenderEnabled(false);
        try
        {
            await executeReview(scope, deps);
        }
        finally
        {
            deps.setRenderEnabled(true);
        }
    };

    return { runReview };
}
