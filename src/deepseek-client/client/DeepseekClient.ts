import { API_ENDPOINTS, CHAT_CONFIG } from "../config/constants";
import { HeadersBuilder } from "../config/headers";
import type { ChatPayload, DeepseekHistoryData, SendMessageOptions } from "../types";
import { getRecord, isRecord } from "../utils/record";
import ChatSession from "./ChatSession";
import PowService from "../services/PowService";

export default class DeepseekClient
{
    private readonly token: string;
    private readonly powService: PowService;
    private currentSession: ChatSession | null = null;

    constructor(token: string)
    {
        this.token = token;
        this.powService = new PowService();
    }

    async initialize(): Promise<void>
    {
        await this.powService.initialize();
    }

    async createSession(): Promise<ChatSession>
    {
        this.currentSession = await ChatSession.create(this.token);
        return this.currentSession;
    }

    async sendMessage(
        message: string,
        session: ChatSession | null = null,
        options: SendMessageOptions = {},
    ): Promise<Response>
    {
        if (!session && !this.currentSession)
        {
            session = await this.createSession();
        }

        const chatSession = session ?? this.currentSession;
        if (!chatSession)
        {
            throw new Error("Missing chat session");
        }

        const powDataB64 = await this.powService.getPowResponse(
            this.token,
            API_ENDPOINTS.TARGET_PATH,
        );
        const headers = HeadersBuilder.getChatHeaders(this.token, powDataB64);
        const parentMessageId = chatSession.getParentMessageId();

        const payload: ChatPayload = {
            prompt: message,
            model: CHAT_CONFIG.DEFAULT_MODEL,
            model_type: options.model_type ?? (parentMessageId === null ? "default" : null),
            stream: true,
            temperature: CHAT_CONFIG.DEFAULT_TEMPERATURE,
            max_tokens: CHAT_CONFIG.DEFAULT_MAX_TOKENS,
            ref_file_ids: [],
            thinking_enabled: options.thinking_enabled ?? false,
            search_enabled: options.search_enabled ?? false,
            chat_session_id: chatSession.getId(),
            parent_message_id: parentMessageId,
        };

        const response = await fetch(API_ENDPOINTS.COMPLETION, {
            method: "POST",
            headers,
            body: JSON.stringify(payload),
        });

        if (!response.ok)
        {
            const errorData = await response.text();
            throw new Error(
                `Chat completion failed: ${response.status} ${errorData}`,
            );
        }

        return response;
    }

    async fetchHistory(sessionId: string): Promise<DeepseekHistoryData>
    {
        const url = `${API_ENDPOINTS.HISTORY_MESSAGES}?chat_session_id=${encodeURIComponent(sessionId)}`;
        const headers = HeadersBuilder.getAuthHeaders(this.token);
        const response = await fetch(url, { method: "GET", headers });

        if (!response.ok)
        {
            const errorData = await response.text();
            throw new Error(`History fetch failed: ${response.status} ${errorData}`);
        }

        const json = (await response.json()) as unknown;
        const data = getRecord(json, "data");
        const bizData = getRecord(data, "biz_data");

        if (!isRecord(bizData))
        {
            throw new Error("Invalid history response: missing biz_data");
        }

        const chatSession = bizData.chat_session;
        const chatMessages = bizData.chat_messages;

        if (!isRecord(chatSession) || !Array.isArray(chatMessages))
        {
            throw new Error("Invalid history response: missing chat_session or chat_messages");
        }

        return bizData as unknown as DeepseekHistoryData;
    }

    loadExistingSession(sessionId: string, parentMessageId: number | null = null): ChatSession
    {
        const session = ChatSession.fromExisting(sessionId, parentMessageId);
        this.currentSession = session;
        return session;
    }
}
