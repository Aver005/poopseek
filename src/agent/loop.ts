import type ChatSession from "@/deepseek-client/client/ChatSession";
import type DeepseekClient from "@/deepseek-client/client/DeepseekClient";
import { collectDeepseekOutput } from "@/bridge/deepseek-stream";
import type { ModelType } from "@/deepseek-client/types";
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
    getModelType?: () => ModelType;
    getSearchEnabled?: () => boolean;
    getThinkingEnabled?: () => boolean;
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
    private readonly getDeepseekClient: () => DeepseekClient;
    private readonly getSession: () => ChatSession;
    private readonly contextManager: ContextManager;
    private readonly toolExecutor: ToolExecutor;
    private readonly options: AgentLoopOptions;

    constructor(
        getDeepseekClient: () => DeepseekClient,
        getSession: () => ChatSession,
        contextManager: ContextManager,
        toolExecutor: ToolExecutor,
        options: Partial<AgentLoopOptions> = {},
    )
    {
        this.getDeepseekClient = getDeepseekClient;
        this.getSession = getSession;
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
            const session = this.getSession();
            callbacks.onModelRequestStart?.();
            let collected: Awaited<ReturnType<typeof collectDeepseekOutput>>;
            try
            {
                const response = await this.getDeepseekClient().sendMessage(nextPrompt, session, {
                    model_type: this.options.getModelType?.(),
                    search_enabled: this.options.getSearchEnabled?.(),
                    thinking_enabled: this.options.getThinkingEnabled?.(),
                });
                collected = await collectDeepseekOutput(response);
            }
            finally
            {
                callbacks.onModelRequestDone?.();
            }

            if (collected.parentMessageId !== null)
            {
                session.setParentMessageId(collected.parentMessageId);
            }

            const assistantText = collected.text.trim();
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
                // Show any commentary/reasoning the model wrote before this tool call
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

            // Show text that appeared after all tool calls (if we didn't bail early)
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
