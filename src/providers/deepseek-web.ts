import { streamDeepseekOutput } from "@/bridge/deepseek-stream";
import DeepseekClient from "@/deepseek-client/client/DeepseekClient";
import type ChatSession from "@/deepseek-client/client/ChatSession";
import type { ModelType } from "@/deepseek-client/types";
import type { ILLMProvider, ProviderCallOptions, ProviderCapabilities, ProviderInfo, ProviderMessage } from "./types";

export class DeepseekWebProvider implements ILLMProvider
{
    readonly info: ProviderInfo = { id: "deepseek-web", label: "DeepSeek (web)" };
    readonly capabilities: ProviderCapabilities = { webSearch: true, thinking: true };

    private session: ChatSession | null = null;
    private systemSentForSession = false;

    constructor(private readonly client: DeepseekClient) {}

    static async create(token: string): Promise<DeepseekWebProvider>
    {
        const client = new DeepseekClient(token);
        await client.initialize();
        const provider = new DeepseekWebProvider(client);
        await provider.reset();
        return provider;
    }

    async reset(): Promise<void>
    {
        this.session = await this.client.createSession();
        this.systemSentForSession = false;
    }

    async clone(): Promise<ILLMProvider>
    {
        const fresh = new DeepseekWebProvider(this.client);
        await fresh.reset();
        return fresh;
    }

    async *complete(messages: ProviderMessage[], system: string, options?: ProviderCallOptions): AsyncIterable<string>
    {
        if (!this.session) await this.reset();

        const lastMsg = messages[messages.length - 1];
        if (!lastMsg) return;

        let content: string;

        if (!this.systemSentForSession)
        {
            const parts: string[] = [];
            if (system.trim().length > 0) parts.push(system.trim());

            if (messages.length > 1)
            {
                const history = messages
                    .slice(0, -1)
                    .map((m) =>
                    {
                        if (m.role === "tool") return `[TOOL:${m.name ?? "unknown"}]\n${m.content}`;
                        return `[${m.role.toUpperCase()}]\n${m.content}`;
                    })
                    .join("\n\n");
                parts.push("", "### LOCAL MEMORY", history);
            }

            if (lastMsg.role === "tool")
            {
                parts.push("", `### TOOL RESULT: ${lastMsg.name ?? "unknown"}`, lastMsg.content);
            }
            else if (lastMsg.content.length > 0)
            {
                parts.push("", "### USER INPUT", lastMsg.content);
            }

            content = parts.join("\n");
            this.systemSentForSession = true;
        }
        else
        {
            if (lastMsg.role === "tool")
            {
                content = `### TOOL RESULT: ${lastMsg.name ?? "unknown"}\n${lastMsg.content}`;
            }
            else
            {
                content = lastMsg.content.length > 0
                    ? `### USER INPUT\n${lastMsg.content}`
                    : lastMsg.content;
            }
        }

        const modelType: ModelType = options?.modelVariant === "expert" ? "expert" : "default";
        const response = await this.client.sendMessage(content, this.session!, {
            model_type: modelType,
            search_enabled: options?.searchEnabled,
            thinking_enabled: options?.thinkingEnabled,
            signal: options?.signal,
        });

        let parentMessageId: number | null = null;

        for await (const event of streamDeepseekOutput(response, { signal: options?.signal }))
        {
            if (event.text) yield event.text;
            if (event.parentMessageId !== undefined) parentMessageId = event.parentMessageId;
        }

        if (parentMessageId !== null) this.session!.setParentMessageId(parentMessageId);
    }

    async listModels(): Promise<string[]>
    {
        return ["default", "expert"];
    }

    getClient(): DeepseekClient
    {
        return this.client;
    }

    async fetchHistory(sessionId: string, signal?: AbortSignal)
    {
        return this.client.fetchHistory(sessionId, signal);
    }

    loadRemoteSession(sessionId: string, parentMessageId: number | null): void
    {
        this.session = this.client.loadExistingSession(
            sessionId,
            parentMessageId ?? undefined,
        );
        // Remote session already has system context on the server side
        this.systemSentForSession = true;
    }

    getSessionId(): string | null
    {
        return this.session?.getId() ?? null;
    }
}
