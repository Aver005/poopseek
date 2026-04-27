import type { ILLMProvider, ProviderCallOptions } from "@/providers";
import ContextManager from "./context-manager";
import { parseMessage } from "./tool-call-parser";
import ToolExecutor from "./tool-executor";
import type {
    AgentTurnResult,
    ToolCallEnvelope,
    ToolExecutionResult,
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

async function executeTool(
    executor: ToolExecutor,
    envelope: ToolCallEnvelope,
    callbacks: AgentTurnCallbacks,
): Promise<ToolExecutionResult>
{
    callbacks.onToolStart?.(envelope.tool, envelope.args);
    const result = await executor.execute(envelope);
    callbacks.onToolDone?.(envelope.tool, result);
    return result;
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

            for (const segment of parsed.toolCalls)
            {
                if (segment.preText.length > 0)
                {
                    callbacks.onAssistantChunk?.(segment.preText);
                }

                toolCallCount += 1;
                const result = await executeTool(this.toolExecutor, segment.envelope, callbacks);

                batchResults.push({
                    name: segment.envelope.tool,
                    content: buildToolResultPayload(segment.envelope.tool, result),
                });
            }

            if (parsed.postText.length > 0)
            {
                callbacks.onAssistantChunk?.(parsed.postText);
            }

            nextPrompt = this.contextManager.prepareToolBatchTurn(batchResults).prompt;
        }

        return {
            assistantText: lastAssistantText,
            toolCalls: toolCallCount,
        };
    }
}
