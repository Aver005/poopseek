import type { ILLMProvider, ProviderCallOptions } from "@/providers";
import ContextManager from "./context-manager";
import { StreamingToolParser } from "./streaming-tool-parser";
import ToolExecutor from "./tool-executor";
import type {
    AgentTurnResult,
    ToolCallEnvelope,
    ToolExecutionResult,
} from "./types";

export interface StreamingAgentLoopOptions {
    maxStepsPerTurn: number;
    maxToolsPerStep: number;
    getCallOptions?: () => ProviderCallOptions;
}

export interface StreamingAgentTurnCallbacks {
    onAssistantChunk?: (chunk: string) => void;
    onToolStart?: (toolName: string, toolArgs: Record<string, unknown>) => void;
    onToolDone?: (toolName: string, result: ToolExecutionResult) => void;
    onModelRequestStart?: () => void;
    onModelRequestDone?: () => void;
    onToolParseError?: (content: string) => void;
    signal?: AbortSignal;
}

const DEFAULT_OPTIONS: StreamingAgentLoopOptions = {
    maxStepsPerTurn: 256,
    maxToolsPerStep: 10,
};

function buildToolResultPayload(toolName: string, result: ToolExecutionResult): string {
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
    callbacks: StreamingAgentTurnCallbacks,
): Promise<ToolExecutionResult> {
    callbacks.onToolStart?.(envelope.tool, envelope.args);
    const result = await executor.execute(envelope);
    callbacks.onToolDone?.(envelope.tool, result);
    return result;
}

/**
 * Streaming version of AgentLoop that detects tools in real-time
 * as chunks arrive, preventing JSON fragmentation issues.
 */
export default class StreamingAgentLoop {
    private readonly getProvider: () => ILLMProvider;
    private readonly contextManager: ContextManager;
    private readonly toolExecutor: ToolExecutor;
    private readonly options: StreamingAgentLoopOptions;

    constructor(
        getProvider: () => ILLMProvider,
        contextManager: ContextManager,
        toolExecutor: ToolExecutor,
        options: Partial<StreamingAgentLoopOptions> = {},
    ) {
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
        callbacks: StreamingAgentTurnCallbacks = {},
    ): Promise<AgentTurnResult> {
        const throwIfAborted = (): void =>
        {
            if (!callbacks.signal?.aborted) return;
            throw callbacks.signal.reason instanceof Error
                ? callbacks.signal.reason
                : new Error("Операция прервана");
        };
        let lastAssistantText = "";
        let toolCallCount = 0;
        let nextPrompt = this.contextManager.prepareUserTurn(userInput).prompt;

        for (let step = 0; step < this.options.maxStepsPerTurn; step += 1) {
            throwIfAborted();
            callbacks.onModelRequestStart?.();
            
            const toolParser = new StreamingToolParser({ maxTools: this.options.maxToolsPerStep });
            let assistantText = "";
            let hasDetectedTools = false;
            const batchResults: Array<{ name: string; content: string }> = [];

            try {
                for await (const chunk of this.getProvider().complete(
                    nextPrompt,
                    {
                        ...this.options.getCallOptions?.(),
                        signal: callbacks.signal,
                    },
                )) {
                    throwIfAborted();
                    assistantText += chunk;

                    const completedTools = toolParser.feed(chunk);
                    if (completedTools.length > 0) {
                        hasDetectedTools = true;
                        for (const toolEvent of completedTools) {
                            if (toolEvent.preText.length > 0) {
                                callbacks.onAssistantChunk?.(toolEvent.preText);
                            }
                            throwIfAborted();
                            toolCallCount += 1;
                            const result = await executeTool(this.toolExecutor, toolEvent.envelope, callbacks);
                            batchResults.push({
                                name: toolEvent.envelope.tool,
                                content: buildToolResultPayload(toolEvent.envelope.tool, result),
                            });
                        }
                    }
                }

                const finalTools = toolParser.finalize();
                for (const toolEvent of finalTools) {
                    if (toolEvent.preText.length > 0) {
                        callbacks.onAssistantChunk?.(toolEvent.preText);
                    }
                    throwIfAborted();
                    toolCallCount += 1;
                    const result = await executeTool(this.toolExecutor, toolEvent.envelope, callbacks);
                    batchResults.push({
                        name: toolEvent.envelope.tool,
                        content: buildToolResultPayload(toolEvent.envelope.tool, result),
                    });
                }

                for (const warning of toolParser.getWarnings()) {
                    callbacks.onToolParseError?.(warning.content);
                }

                if (!hasDetectedTools && finalTools.length === 0) {
                    if (assistantText.length > 0) {
                        callbacks.onAssistantChunk?.(assistantText);
                    }
                    this.contextManager.addAssistant(assistantText);
                    lastAssistantText = assistantText;
                    break;
                }

                this.contextManager.addAssistant(assistantText);
                nextPrompt = this.contextManager.prepareToolBatchTurn(batchResults).prompt;

            } finally {
                callbacks.onModelRequestDone?.();
            }
        }

        return {
            assistantText: lastAssistantText,
            toolCalls: toolCallCount,
        };
    }
}
