import type ChatSession from "@/deepseek-client/client/ChatSession";
import type DeepseekClient from "@/deepseek-client/client/DeepseekClient";
import { collectDeepseekOutput } from "@/bridge/deepseek-stream";
import type { ModelType } from "@/deepseek-client/types";
import ContextManager from "./context-manager";
import { parseToolCallFromText } from "./tool-call-parser";
import ToolExecutor from "./tool-executor";
import type {
    AgentTurnResult,
    ToolExecutionResult,
    ToolFlowAction,
} from "./types";

export interface AgentLoopOptions
{
    maxStepsPerTurn: number;
    getModelType?: () => ModelType;
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
    maxStepsPerTurn: 10,
};

function buildToolResultMessage(toolName: string, result: ToolExecutionResult): string
{
    const payload = {
        tool: toolName,
        ok: result.ok,
        output: result.output,
        error: result.error ?? null,
        data: result.data ?? null,
    };

    return JSON.stringify(payload, null, 2);
}

function resolveAction(
    ok: boolean,
    onSuccess: ToolFlowAction,
    onError: ToolFlowAction,
): ToolFlowAction
{
    return ok ? onSuccess : onError;
}

export default class AgentLoop
{
    private readonly deepseekClient: DeepseekClient;
    private readonly session: ChatSession;
    private readonly contextManager: ContextManager;
    private readonly toolExecutor: ToolExecutor;
    private readonly options: AgentLoopOptions;

    constructor(
        deepseekClient: DeepseekClient,
        session: ChatSession,
        contextManager: ContextManager,
        toolExecutor: ToolExecutor,
        options: Partial<AgentLoopOptions> = {},
    )
    {
        this.deepseekClient = deepseekClient;
        this.session = session;
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
        this.contextManager.addUser(userInput);

        let lastAssistantText = "";
        let toolCalls = 0;

        for (let step = 0; step < this.options.maxStepsPerTurn; step += 1)
        {
            const prompt = this.contextManager.buildPrompt();
            callbacks.onModelRequestStart?.();
            let collected: Awaited<ReturnType<typeof collectDeepseekOutput>>;
            try
            {
                const response = await this.deepseekClient.sendMessage(prompt, this.session, {
                    model_type: this.options.getModelType?.(),
                });
                collected = await collectDeepseekOutput(response);
            }
            finally
            {
                callbacks.onModelRequestDone?.();
            }

            if (collected.parentMessageId !== null)
            {
                this.session.setParentMessageId(collected.parentMessageId);
            }

            const assistantText = collected.text.trim();
            this.contextManager.addAssistant(assistantText);
            lastAssistantText = assistantText;

            const toolCall = parseToolCallFromText(assistantText);
            if (!toolCall)
            {
                if (assistantText.length > 0)
                {
                    callbacks.onAssistantChunk?.(assistantText);
                }
                break;
            }

            lastAssistantText = "";

            toolCalls += 1;
            callbacks.onToolStart?.(toolCall.tool, toolCall.args);

            let toolResult = await this.toolExecutor.execute(toolCall);
            callbacks.onToolDone?.(toolCall.tool, toolResult);

            let action = resolveAction(
                toolResult.ok,
                toolCall.onSuccess,
                toolCall.onError,
            );

            if (action === "try-again")
            {
                callbacks.onToolStart?.(toolCall.tool, toolCall.args);
                toolResult = await this.toolExecutor.execute(toolCall);
                callbacks.onToolDone?.(toolCall.tool, toolResult);
                action = resolveAction(
                    toolResult.ok,
                    toolCall.onSuccess,
                    toolCall.onError,
                );
            }

            const toolMessage = buildToolResultMessage(toolCall.tool, toolResult);
            this.contextManager.addTool(toolCall.tool, toolMessage);

            if (action === "stop") break;
            if (action === "ask-user")
            {
                lastAssistantText =
                    "Нужна реакция пользователя по результату инструмента. Продолжите диалог.";
                callbacks.onAssistantChunk?.(lastAssistantText);
                break;
            }
        }

        return {
            assistantText: lastAssistantText,
            toolCalls,
        };
    }
}
