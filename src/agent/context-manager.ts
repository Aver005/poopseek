import type { AgentMessage } from "./types";
import type { VariableProcessor } from "@/variables";

export interface ContextManagerOptions
{
    maxMessages: number;
}

const DEFAULT_OPTIONS: ContextManagerOptions = {
    maxMessages: 30,
};

function trimMessages(
    messages: AgentMessage[],
    maxMessages: number,
): AgentMessage[]
{
    if (messages.length <= maxMessages) return messages;
    return messages.slice(messages.length - maxMessages);
}

export default class ContextManager
{
    private readonly basePrompt: string;
    private readonly toolsPrompt: string;
    private readonly options: ContextManagerOptions;
    private readonly variableProcessor: VariableProcessor | null;
    private messages: AgentMessage[] = [];

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

    clearHistory(): void
    {
        this.messages = [];
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

    buildPrompt(): string
    {
        const blocks = [
            "### SYSTEM",
            this.basePrompt,
            "",
            "### TOOLS",
            this.toolsPrompt,
            "",
            "### DIALOGUE",
            this.formatMessages(),
            "",
            "### OUTPUT RULES",
            "Если нужно вызвать инструмент, верни только один JSON-объект вызова инструмента.",
            "Если инструмент не нужен, отвечай обычным текстом без JSON.",
        ];

        const rawPrompt = blocks.join("\n");
        if (!this.variableProcessor) return rawPrompt;
        return this.variableProcessor.process(rawPrompt);
    }
}
