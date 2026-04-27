import type { ILLMProvider, ProviderCallOptions } from "@/providers";
import ContextManager from "./context-manager";
import { parseMessage } from "./tool-call-parser";
import ToolExecutor from "./tool-executor";
import type {
    AgentTurnResult,
    ToolCallEnvelope,
    ToolExecutionResult,
    ToolFlowAction,
} from "./types";

export interface AgentLoopOptions
{
    maxStepsPerTurn: number;
    maxToolsPerStep: number;
    getCallOptions?: () => ProviderCallOptions;
}

export interface AgentTurnCallbacks
{
    onAssistantChunk?: (chunk: string) => void;
    onToolStart?: (toolName: string, toolArgs: Record<string, unknown>) => void;
    onToolDone?: (toolName: string, result: ToolExecutionResult) => void;
    onModelRequestStart?: () => void;
    onModelRequestDone?: () => void;
}

const DEFAULT_OPTIONS: AgentLoopOptions = {
    maxStepsPerTurn: 256,
    maxToolsPerStep: 10,
};

function buildToolResultPayload(toolName: string, result: ToolExecutionResult): string
{
    return JSON.stringify(
        {
            tool: toolName,
            ok: result.ok,
            output: result.output,
            error: result.error ?? null,
            data: result.data ?? null,
        },
        null,
        2,
    );
}

function resolveAction(
    ok: boolean,
    onSuccess: ToolFlowAction,
    onError: ToolFlowAction,
): ToolFlowAction
{
    return ok ? onSuccess : onError;
}

async function executeWithRetry(
    executor: ToolExecutor,
    envelope: ToolCallEnvelope,
    callbacks: AgentTurnCallbacks,
): Promise<{ result: ToolExecutionResult; action: ToolFlowAction }>
{
    callbacks.onToolStart?.(envelope.tool, envelope.args);
    let result = await executor.execute(envelope);
    callbacks.onToolDone?.(envelope.tool, result);

    let action = resolveAction(result.ok, envelope.onSuccess, envelope.onError);

    if (action === "try-again")
    {
        callbacks.onToolStart?.(envelope.tool, envelope.args);
        result = await executor.execute(envelope);
        callbacks.onToolDone?.(envelope.tool, result);
        action = resolveAction(result.ok, envelope.onSuccess, envelope.onError);
    }

    return { result, action };
}

export default class AgentLoop
{
    private readonly getProvider: () => ILLMProvider;
    private readonly contextManager: ContextManager;
    private readonly toolExecutor: ToolExecutor;
    private readonly options: AgentLoopOptions;

    constructor(
        getProvider: () => ILLMProvider,
        contextManager: ContextManager,
        toolExecutor: ToolExecutor,
        options: Partial<AgentLoopOptions> = {},
    )
    {
        this.getProvider = getProvider;
        this.contextManager = contextManager;
        this.toolExecutor = toolExecutor;
        this.options = {
            ...DEFAULT_OPTIONS,
            ...options,
        };
    }

    async runTurn(
        userInput: string,
        callbacks: AgentTurnCallbacks = {},
    ): Promise<AgentTurnResult>
    {
        let lastAssistantText = "";
        let toolCallCount = 0;
        let nextPrompt = this.contextManager.prepareUserTurn(userInput).prompt;

        for (let step = 0; step < this.options.maxStepsPerTurn; step += 1)
        {
            callbacks.onModelRequestStart?.();
            let assistantText: string;
            try
            {
                const chunks: string[] = [];
                for await (const chunk of this.getProvider().complete(
                    nextPrompt,
                    this.options.getCallOptions?.(),
                ))
                {
                    chunks.push(chunk);
                }
                assistantText = chunks.join("").trim();
            }
            finally
            {
                callbacks.onModelRequestDone?.();
            }

            this.contextManager.addAssistant(assistantText);
            lastAssistantText = assistantText;

            const parsed = parseMessage(assistantText, this.options.maxToolsPerStep);

            if (parsed.toolCalls.length === 0)
            {
                if (assistantText.length > 0)
                {
                    callbacks.onAssistantChunk?.(assistantText);
                }
                break;
            }

            lastAssistantText = "";

            const batchResults: Array<{ name: string; content: string }> = [];
            let shouldStop = false;
            let shouldAskUser = false;

            for (const segment of parsed.toolCalls)
            {
                if (segment.preText.length > 0)
                {
                    callbacks.onAssistantChunk?.(segment.preText);
                }

                toolCallCount += 1;
                const { result, action } = await executeWithRetry(
                    this.toolExecutor,
                    segment.envelope,
                    callbacks,
                );

                batchResults.push({
                    name: segment.envelope.tool,
                    content: buildToolResultPayload(segment.envelope.tool, result),
                });

                if (action === "stop")
                {
                    shouldStop = true;
                    break;
                }

                if (action === "ask-user")
                {
                    shouldAskUser = true;
                    break;
                }
            }

            if (!shouldStop && !shouldAskUser && parsed.postText.length > 0)
            {
                callbacks.onAssistantChunk?.(parsed.postText);
            }

            nextPrompt = this.contextManager.prepareToolBatchTurn(batchResults).prompt;

            if (shouldStop) break;

            if (shouldAskUser)
            {
                lastAssistantText =
                    "Нужна реакция пользователя по результату инструмента. Продолжите диалог.";
                callbacks.onAssistantChunk?.(lastAssistantText);
                break;
            }
        }

        return {
            assistantText: lastAssistantText,
            toolCalls: toolCallCount,
        };
    }
}
