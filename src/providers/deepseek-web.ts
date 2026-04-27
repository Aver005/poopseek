import { collectDeepseekOutput } from "@/bridge/deepseek-stream";
import DeepseekClient from "@/deepseek-client/client/DeepseekClient";
import type ChatSession from "@/deepseek-client/client/ChatSession";
import type { ModelType } from "@/deepseek-client/types";
import type { ILLMProvider, ProviderCallOptions, ProviderInfo } from "./types";

export class DeepseekWebProvider implements ILLMProvider
{
    readonly info: ProviderInfo = { id: "deepseek-web", label: "DeepSeek (web)" };

    private session: ChatSession | null = null;

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
    }

    async clone(): Promise<ILLMProvider>
    {
        const fresh = new DeepseekWebProvider(this.client);
        await fresh.reset();
        return fresh;
    }

    async *complete(prompt: string, options?: ProviderCallOptions): AsyncIterable<string>
    {
        if (!this.session) await this.reset();
        const modelType: ModelType = options?.modelVariant === "expert" ? "expert" : "default";
        const response = await this.client.sendMessage(prompt, this.session!, {
            model_type: modelType,
            search_enabled: options?.searchEnabled,
            thinking_enabled: options?.thinkingEnabled,
        });
        const { text, parentMessageId } = await collectDeepseekOutput(response);
        if (parentMessageId !== null) this.session!.setParentMessageId(parentMessageId);
        if (text.length > 0) yield text;
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
    }

    getSessionId(): string | null
    {
        return this.session?.getId() ?? null;
    }
}
