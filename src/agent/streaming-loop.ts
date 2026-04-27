import type { ILLMProvider, ProviderCallOptions } from "@/providers";
import ContextManager from "./context-manager";
import { StreamingToolParser, type ParsedToolEvent } from "./streaming-tool-parser";
import ToolExecutor from "./tool-executor";
import type {
    AgentTurnResult,
    ToolCallEnvelope,
    ToolExecutionResult,
    ToolFlowAction,
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

function resolveAction(
    ok: boolean,
    onSuccess: ToolFlowAction,
    onError: ToolFlowAction,
): ToolFlowAction {
    return ok ? onSuccess : onError;
}

async function executeWithRetry(
    executor: ToolExecutor,
    envelope: ToolCallEnvelope,
    callbacks: StreamingAgentTurnCallbacks,
): Promise<{ result: ToolExecutionResult; action: ToolFlowAction }> {
    callbacks.onToolStart?.(envelope.tool, envelope.args);
    let result = await executor.execute(envelope);
    callbacks.onToolDone?.(envelope.tool, result);

    let action = resolveAction(result.ok, envelope.onSuccess, envelope.onError);

    if (action === "try-again") {
        callbacks.onToolStart?.(envelope.tool, envelope.args);
        result = await executor.execute(envelope);
        callbacks.onToolDone?.(envelope.tool, result);
        action = resolveAction(result.ok, envelope.onSuccess, envelope.onError);
    }

    return { result, action };
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
        let lastAssistantText = "";
        let toolCallCount = 0;
        let nextPrompt = this.contextManager.prepareUserTurn(userInput).prompt;

        for (let step = 0; step < this.options.maxStepsPerTurn; step += 1) {
            callbacks.onModelRequestStart?.();
            
            const toolParser = new StreamingToolParser({ maxTools: this.options.maxToolsPerStep });
            const fullTextChunks: string[] = [];
            let assistantText = "";
            let hasDetectedTools = false;
            let shouldStop = false;
            let shouldAskUser = false;
            const batchResults: Array<{ name: string; content: string }> = [];
            let lastPreTextAccumulator = "";

            try {
                // Process chunks as they arrive
                for await (const chunk of this.getProvider().complete(
                    nextPrompt,
                    this.options.getCallOptions?.(),
                )) {
                    fullTextChunks.push(chunk);
                    assistantText += chunk;
                    
                    // Feed chunk to streaming parser
                    const completedTools = toolParser.feed(chunk);
                    
                    if (completedTools.length > 0) {
                        hasDetectedTools = true;
                        
                        // Execute detected tools as they become available
                        for (const toolEvent of completedTools) {
                            // Send pre-text to callbacks
                            if (toolEvent.preText.length > 0) {
                                callbacks.onAssistantChunk?.(toolEvent.preText);
                            }

                            toolCallCount += 1;
                            const { result, action } = await executeWithRetry(
                                this.toolExecutor,
                                toolEvent.envelope,
                                callbacks,
                            );

                            batchResults.push({
                                name: toolEvent.envelope.tool,
                                content: buildToolResultPayload(toolEvent.envelope.tool, result),
                            });

                            if (action === "stop") {
                                shouldStop = true;
                                break;
                            }

                            if (action === "ask-user") {
                                shouldAskUser = true;
                                break;
                            }
                        }
                        
                        if (shouldStop || shouldAskUser) break;
                    }
                }
                
                // Finalize: get any remaining tools that might have been incomplete
                const finalTools = toolParser.finalize();
                if (!shouldStop && !shouldAskUser && finalTools.length > 0) {
                    for (const toolEvent of finalTools) {
                        if (toolEvent.preText.length > 0) {
                            callbacks.onAssistantChunk?.(toolEvent.preText);
                        }

                        toolCallCount += 1;
                        const { result, action } = await executeWithRetry(
                            this.toolExecutor,
                            toolEvent.envelope,
                            callbacks,
                        );

                        batchResults.push({
                            name: toolEvent.envelope.tool,
                            content: buildToolResultPayload(toolEvent.envelope.tool, result),
                        });

                        if (action === "stop") {
                            shouldStop = true;
                            break;
                        }

                        if (action === "ask-user") {
                            shouldAskUser = true;
                            break;
                        }
                    }
                }
                
                // If no tools were detected at all, treat as pure text response
                if (!hasDetectedTools && finalTools.length === 0) {
                    if (assistantText.length > 0) {
                        callbacks.onAssistantChunk?.(assistantText);
                    }
                    this.contextManager.addAssistant(assistantText);
                    lastAssistantText = assistantText;
                    break;
                }
                
                // Add assistant message to context (might be partial if tools were executed)
                this.contextManager.addAssistant(assistantText);
                
                // Get post-text from parser (text after last tool)
                const completedList = toolParser.getCompletedTools();
                const lastTool = completedList[completedList.length - 1];
                if (!shouldStop && !shouldAskUser && lastTool) {
                    // Post-text would be handled by next iteration
                }
                
                // Prepare next prompt with tool results
                nextPrompt = this.contextManager.prepareToolBatchTurn(batchResults).prompt;
                
                if (shouldStop) break;
                if (shouldAskUser) {
                    lastAssistantText = "Нужна реакция пользователя по результату инструмента. Продолжите диалог.";
                    callbacks.onAssistantChunk?.(lastAssistantText);
                    break;
                }
                
                // Continue loop if there are more tools to process
                continue;
                
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
