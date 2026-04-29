import { collectDeepseekOutput } from "@/bridge/deepseek-stream";
import DeepseekClient from "@/deepseek-client/client/DeepseekClient";
import type ChatSession from "@/deepseek-client/client/ChatSession";
import type { ModelType } from "@/deepseek-client/types";
import type { ILLMProvider, ProviderCallOptions, ProviderInfo, ProviderMessage } from "./types";

export class DeepseekWebProvider implements ILLMProvider
{
    readonly info: ProviderInfo = { id: "deepseek-web", label: "DeepSeek (web)" };

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
            // First call in this session: pack system + any restored history into one message,
            // preserving the same format the old bootstrap produced.
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
            // Subsequent calls: send only the new message with a lightweight header
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
        const { text, parentMessageId } = await collectDeepseekOutput(response, {
            signal: options?.signal,
        });
        if (parentMessageId !== null) this.session!.setParentMessageId(parentMessageId);
        if (text.length > 0) yield text;
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
