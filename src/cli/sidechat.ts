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

type SidechatPrompts = {
    basePrompt: string;
    toolsPrompt: string;
};

type GenerationIndicatorRef = {
    start(): void;
    stop(): void;
};

export type SidechatDeps = {
    getProvider: () => ILLMProvider;
    getCallOptions: () => ProviderCallOptions;
    getWorkspaceRoot: () => string;
    prompts: SidechatPrompts;
    variableProcessor: VariableProcessor;
    generationIndicator: GenerationIndicatorRef;
    getAskUser: () => AskUserFn;
    writeDetachedOutput: (value: string) => void;
    setRenderEnabled: (enabled: boolean) => void;
};

async function executeSidechat(
    question: string,
    deps: SidechatDeps,
    options: {
        buffered?: boolean;
        showHeader?: boolean;
        useIndicator?: boolean;
    } = {},
): Promise<void>
{
    const buffered = options.buffered ?? false;
    const showHeader = options.showHeader ?? true;
    const useIndicator = options.useIndicator ?? true;
    const chunks: string[] = [];
    const write = (value: string): void =>
    {
        if (buffered) chunks.push(value);
        else output.write(value);
    };

    const sideProvider = await deps.getProvider().clone();
    const sideContext = new ContextManager(
        deps.prompts.basePrompt,
        deps.prompts.toolsPrompt,
        { maxMessages: 10 },
        deps.variableProcessor,
    );
    const sideTool = new ToolExecutor(deps.getWorkspaceRoot(), (req) => deps.getAskUser()(req));
    const callOptions = deps.getCallOptions();
    const sideLoop = new AgentLoop(() => sideProvider, sideContext, sideTool, {
        maxStepsPerTurn: 6,
        getCallOptions: () => ({ modelVariant: callOptions.modelVariant }),
    });

    if (showHeader)
    {
        write(`\n${colors.cyan("◈ btw")} ${colors.dim("—")} ${question}\n`);
    }

    try
    {
        let wroteAnyChunk = false;
        await sideLoop.runTurn(question, {
            onModelRequestStart: () =>
            {
                if (useIndicator) deps.generationIndicator.start();
            },
            onModelRequestDone: () =>
            {
                if (useIndicator) deps.generationIndicator.stop();
            },
            onAssistantChunk: (chunk) =>
            {
                if (useIndicator) deps.generationIndicator.stop();
                if (!wroteAnyChunk)
                {
                    write("\n");
                    wroteAnyChunk = true;
                }
                write(renderMarkdown(chunk));
            },
            onToolStart: (toolName, toolArgs) =>
            {
                if (useIndicator) deps.generationIndicator.stop();
                const detail = getToolDetail(toolName, toolArgs);
                const suffix = detail ? ` ${colors.dim(`(${detail})`)}` : "";
                write(`\n${colors.yellow(getToolProgressMessage(toolName))}${suffix}\n`);
            },
            onToolDone: (toolName, toolResult) =>
            {
                const marker = toolResult.ok ? colors.green("ok") : colors.red("not ok");
                write(`${colors.dim("[btw/tool]")} ${colors.cyan(toolName)} ${marker}\n`);
            },
        });
        write("\n\n");
    }
    catch
    {
        if (useIndicator) deps.generationIndicator.stop();
        write(`${colors.red("btw: ошибка запроса")}\n\n`);
    }

    if (buffered && chunks.length > 0)
    {
        deps.writeDetachedOutput(chunks.join(""));
    }
}

export function createSidechatRunner(deps: SidechatDeps): {
    runSidechat: (question: string) => Promise<void>;
    startQueuedSidechat: (question: string) => void;
    pendingTasks: Set<Promise<void>>;
}
{
    const pendingTasks = new Set<Promise<void>>();

    const runSidechat = async (question: string): Promise<void> =>
    {
        deps.setRenderEnabled(false);
        try
        {
            await executeSidechat(question, deps);
        }
        finally
        {
            deps.setRenderEnabled(true);
        }
    };

    const startQueuedSidechat = (question: string): void =>
    {
        deps.writeDetachedOutput(`\n${colors.cyan("◈ btw")} ${colors.dim("—")} ${question}\n`);
        const task = executeSidechat(question, deps, {
            buffered: true,
            showHeader: false,
            useIndicator: false,
        });
        pendingTasks.add(task);
        void task.finally(() =>
        {
            pendingTasks.delete(task);
        });
    };

    return { runSidechat, startQueuedSidechat, pendingTasks };
}
