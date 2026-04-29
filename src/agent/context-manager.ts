import type { AgentMessage } from "./types";
import type { VariableProcessor } from "@/variables";

export interface ContextManagerOptions
{
    maxMessages: number;
}

const DEFAULT_OPTIONS: ContextManagerOptions = {
    maxMessages: 256,
};

function trimMessages(
    messages: AgentMessage[],
    maxMessages: number,
): AgentMessage[]
{
    if (messages.length <= maxMessages) return messages;
    return messages.slice(messages.length - maxMessages);
}

export interface ContextManagerState
{
    messages: AgentMessage[];
}

export default class ContextManager
{
    private readonly basePrompt: string;
    private readonly toolsPrompt: string;
    private readonly options: ContextManagerOptions;
    private readonly variableProcessor: VariableProcessor | null;
    private messages: AgentMessage[] = [];
    private skillsContent: string = "";
    private availableSkillsHint: string = "";
    private mcpToolsDoc: string = "";
    private mcpResourcesContext: string = "";
    private webToolsDoc: string = "";
    private activeRoleContent: string = "";
    private poetModeContent: string = "";

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
        this.messages.push({ role: "user", content });
        this.messages = trimMessages(this.messages, this.options.maxMessages);
    }

    addAssistant(content: string): void
    {
        this.messages.push({ role: "assistant", content });
        this.messages = trimMessages(this.messages, this.options.maxMessages);
    }

    addTool(name: string, content: string): void
    {
        this.messages.push({ role: "tool", name, content });
        this.messages = trimMessages(this.messages, this.options.maxMessages);
    }

    getMessageCount(): number
    {
        return this.messages.length;
    }

    getMessages(): AgentMessage[]
    {
        return this.messages.map((m) => ({ ...m }));
    }

    buildSystemPrompt(): string
    {
        return this.processVariables(this.buildSystemSnapshot());
    }

    getDialogueSnapshot(): string
    {
        return this.formatMessages();
    }

    exportState(): ContextManagerState
    {
        return {
            messages: this.messages.map((message) => ({ ...message })),
        };
    }

    restoreState(
        state: ContextManagerState,
        _options: { includeLocalMemoryOnBootstrap?: boolean } = {},
    ): void
    {
        this.messages = trimMessages(
            (state.messages ?? []).map((message) => ({ ...message })),
            this.options.maxMessages,
        );
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

    setSkillsContent(content: string): void
    {
        this.skillsContent = content;
    }

    setAvailableSkillsHint(hint: string): void
    {
        this.availableSkillsHint = hint;
    }

    setMCPToolsDoc(doc: string): void
    {
        this.mcpToolsDoc = doc;
    }

    setMCPResourcesContext(context: string): void
    {
        this.mcpResourcesContext = context;
    }

    setWebToolsDoc(doc: string): void
    {
        this.webToolsDoc = doc;
    }

    setRoleContent(content: string): void
    {
        this.activeRoleContent = content;
    }

    setPoetMode(content: string): void
    {
        this.poetModeContent = content;
    }

    clearHistory(): void
    {
        this.messages = [];
    }

    // Kept for call-site compatibility; no longer needed in the new architecture
    markSessionReset(): void {}

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
            this.basePrompt,
            "",
            "### TOOLS SNAPSHOT",
            this.toolsPrompt,
        ];

        if (this.availableSkillsHint.trim().length > 0)
        {
            blocks.push("", "### AVAILABLE SKILLS", this.availableSkillsHint.trim());
        }

        if (this.skillsContent.trim().length > 0)
        {
            blocks.push("", "### ACTIVE SKILLS", this.skillsContent.trim());
        }

        if (this.webToolsDoc.trim().length > 0)
        {
            blocks.push("", "### WEB TOOLS", this.webToolsDoc.trim());
        }

        if (this.mcpToolsDoc.trim().length > 0)
        {
            blocks.push("", "### MCP TOOLS", this.mcpToolsDoc.trim());
        }

        if (this.mcpResourcesContext.trim().length > 0)
        {
            blocks.push("", "### MCP RESOURCES", this.mcpResourcesContext.trim());
        }

        if (this.activeRoleContent.trim().length > 0)
        {
            blocks.push("", "### ACTIVE ROLE", this.activeRoleContent.trim());
        }

        if (this.poetModeContent.trim().length > 0)
        {
            blocks.push("", "### POET MODE [HIGHEST PRIORITY — OVERRIDES ALL STYLE INSTRUCTIONS]", this.poetModeContent.trim());
        }

        return blocks.join("\n");
    }

    private processVariables(input: string): string
    {
        if (!this.variableProcessor) return input;
        return this.variableProcessor.process(input);
    }
}
