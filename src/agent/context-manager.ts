import type { AgentMessage } from "./types";
import type { VariableProcessor } from "@/variables";

export interface ContextManagerOptions
{
    maxMessages: number;
    refreshEveryApproxTokens: number;
}

const DEFAULT_OPTIONS: ContextManagerOptions = {
    maxMessages: 30,
    refreshEveryApproxTokens: 64_000,
};

function trimMessages(
    messages: AgentMessage[],
    maxMessages: number,
): AgentMessage[]
{
    if (messages.length <= maxMessages) return messages;
    return messages.slice(messages.length - maxMessages);
}

function estimateApproxTokens(text: string): number
{
    const normalized = text.trim();
    if (normalized.length === 0) return 0;
    return Math.max(1, Math.ceil(normalized.length / 4));
}

export interface PreparedTurnMessage
{
    prompt: string;
    approxTokens: number;
    includedBootstrap: boolean;
    includedRefresh: boolean;
}

export default class ContextManager
{
    private readonly basePrompt: string;
    private readonly toolsPrompt: string;
    private readonly options: ContextManagerOptions;
    private readonly variableProcessor: VariableProcessor | null;
    private messages: AgentMessage[] = [];
    private approxTokensSinceRefresh = 0;
    private bootstrapPending = true;

    constructor(
        basePrompt: string,
        toolsPrompt: string,
        options: Partial<ContextManagerOptions> = {},
        variableProcessor: VariableProcessor | null = null,
    )
    {
        this.basePrompt = basePrompt.trim();
        this.toolsPrompt = toolsPrompt.trim();
        this.variableProcessor = variableProcessor;
        this.options = {
            ...DEFAULT_OPTIONS,
            ...options,
        };
    }

    addUser(content: string): void
    {
        this.messages.push({
            role: "user",
            content,
        });
        this.messages = trimMessages(this.messages, this.options.maxMessages);
    }

    addAssistant(content: string): void
    {
        this.messages.push({
            role: "assistant",
            content,
        });
        this.messages = trimMessages(this.messages, this.options.maxMessages);
    }

    addTool(name: string, content: string): void
    {
        this.messages.push({
            role: "tool",
            name,
            content,
        });
        this.messages = trimMessages(this.messages, this.options.maxMessages);
    }

    getMessageCount(): number
    {
        return this.messages.length;
    }

    getApproxTokensSinceRefresh(): number
    {
        return this.approxTokensSinceRefresh;
    }

    getRefreshEveryApproxTokens(): number
    {
        return this.options.refreshEveryApproxTokens;
    }

    isBootstrapPending(): boolean
    {
        return this.bootstrapPending;
    }

    getDialogueSnapshot(): string
    {
        return this.formatMessages();
    }

    replaceWithCompactSummary(summary: string): void
    {
        const normalizedSummary = summary.trim();
        if (normalizedSummary.length === 0)
        {
            this.messages = [];
            return;
        }

        this.messages = [
            {
                role: "assistant",
                content: `# COMPACT CONTEXT\n\n${normalizedSummary}`,
            },
        ];
    }

    clearHistory(): void
    {
        this.messages = [];
        this.markSessionReset();
    }

    markSessionReset(): void
    {
        this.approxTokensSinceRefresh = 0;
        this.bootstrapPending = true;
    }

    prepareUserTurn(content: string): PreparedTurnMessage
    {
        return this.prepareTurnMessage("user", content);
    }

    prepareToolTurn(name: string, content: string): PreparedTurnMessage
    {
        return this.prepareTurnMessage("tool", content, name);
    }

    private formatMessages(): string
    {
        if (this.messages.length === 0) return "История пуста.";

        return this.messages
            .map((message) =>
            {
                if (message.role === "tool")
                {
                    return `[TOOL:${message.name ?? "unknown"}]\n${message.content}`;
                }

                return `[${message.role.toUpperCase()}]\n${message.content}`;
            })
            .join("\n\n");
    }

    private buildSystemSnapshot(): string
    {
        const blocks = [
            "### SYSTEM SNAPSHOT",
            this.processVariables(this.basePrompt),
            "",
            "### TOOLS SNAPSHOT",
            this.processVariables(this.toolsPrompt),
        ];

        return blocks.join("\n");
    }

    private buildRefreshSnapshot(): string
    {
        const blocks = [
            "### CONTEXT REFRESH",
            "Повторяю только важные системные правила, доступные инструменты и текущее окружение.",
            "",
            this.buildSystemSnapshot(),
        ];

        return blocks.join("\n");
    }

    private buildCurrentInputBlock(
        role: "user" | "tool",
        content: string,
        name?: string,
    ): string
    {
        if (role === "tool")
        {
            return [
                `### TOOL RESULT: ${name ?? "unknown"}`,
                content,
            ].join("\n");
        }

        return [
            "### USER INPUT",
            content,
        ].join("\n");
    }

    private prepareTurnMessage(
        role: "user" | "tool",
        content: string,
        name?: string,
    ): PreparedTurnMessage
    {
        const normalizedContent = content.trim();
        const includedBootstrap = this.bootstrapPending;
        const includedRefresh = !includedBootstrap
            && (
                this.approxTokensSinceRefresh + estimateApproxTokens(normalizedContent)
                >= this.options.refreshEveryApproxTokens
            );
        const localMemory = includedBootstrap && this.messages.length > 0
            ? this.formatMessages()
            : "";

        const blocks: string[] = [];

        if (includedBootstrap)
        {
            blocks.push(this.buildSystemSnapshot());
            if (localMemory.length > 0)
            {
                blocks.push("", "### LOCAL MEMORY", localMemory);
            }
        }
        else if (includedRefresh)
        {
            blocks.push(this.buildRefreshSnapshot());
        }

        if (blocks.length > 0) blocks.push("");
        blocks.push(this.buildCurrentInputBlock(role, normalizedContent, name));

        if (role === "tool")
        {
            this.addTool(name ?? "unknown", normalizedContent);
        }
        else
        {
            this.addUser(normalizedContent);
        }

        const prompt = blocks.join("\n");
        const approxTokens = estimateApproxTokens(prompt);

        if (includedBootstrap || includedRefresh)
        {
            this.approxTokensSinceRefresh = approxTokens;
        }
        else
        {
            this.approxTokensSinceRefresh += approxTokens;
        }

        this.bootstrapPending = false;

        return {
            prompt,
            approxTokens,
            includedBootstrap,
            includedRefresh,
        };
    }

    private processVariables(input: string): string
    {
        if (!this.variableProcessor) return input;
        return this.variableProcessor.process(input);
    }
}
