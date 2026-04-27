import { API_ENDPOINTS, CHAT_CONFIG } from "../config/constants";
import { HeadersBuilder } from "../config/headers";
import type { ChatPayload, DeepseekHistoryData, SendMessageOptions } from "../types";
import { getRecord, isRecord } from "../utils/record";
import ChatSession from "./ChatSession";
import PowService from "../services/PowService";

export default class DeepseekClient
{
    private static readonly HISTORY_TIMEOUT_MS = 8000;
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

    async fetchHistory(sessionId: string, signal?: AbortSignal): Promise<DeepseekHistoryData>
    {
        const url = `${API_ENDPOINTS.HISTORY_MESSAGES}?chat_session_id=${encodeURIComponent(sessionId)}`;
        const headers = HeadersBuilder.getAuthHeaders(this.token);
        const controller = new AbortController();
        type RaceResult =
            | { kind: "response"; response: Response }
            | { kind: "error"; error: unknown }
            | { kind: "timeout" }
            | { kind: "interrupt" };

        let timeoutId: ReturnType<typeof setTimeout> | null = null;
        let removeExternalAbortListener: (() => void) | null = null;
        try
        {
            const fetchPromise: Promise<RaceResult> = fetch(url, {
                method: "GET",
                headers,
                signal: controller.signal,
            })
                .then((response) => ({ kind: "response", response }))
                .catch((error: unknown) => ({ kind: "error", error }));

            const timeoutPromise = new Promise<RaceResult>((resolve) =>
            {
                timeoutId = setTimeout(() =>
                {
                    controller.abort("history-timeout");
                    resolve({ kind: "timeout" });
                }, DeepseekClient.HISTORY_TIMEOUT_MS);
            });

            const interruptPromise = new Promise<RaceResult>((resolve) =>
            {
                if (!signal) return;
                if (signal.aborted)
                {
                    controller.abort(signal.reason ?? "user-interrupt");
                    resolve({ kind: "interrupt" });
                    return;
                }
                const onAbort = (): void =>
                {
                    controller.abort(signal.reason ?? "user-interrupt");
                    resolve({ kind: "interrupt" });
                };
                signal.addEventListener("abort", onAbort, { once: true });
                removeExternalAbortListener = () => signal.removeEventListener("abort", onAbort);
            });

            const winner = await Promise.race([fetchPromise, timeoutPromise, interruptPromise]);
            if (winner.kind === "timeout")
            {
                throw new Error(`History fetch timeout after ${DeepseekClient.HISTORY_TIMEOUT_MS}ms`);
            }
            if (winner.kind === "interrupt")
            {
                throw new Error("Загрузка сессии прервана (Ctrl+C)");
            }
            if (winner.kind === "error")
            {
                throw winner.error;
            }
            const response = winner.response;

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
        finally
        {
            if (timeoutId) clearTimeout(timeoutId);
            removeExternalAbortListener?.();
        }
    }

    loadExistingSession(sessionId: string, parentMessageId: number | null = null): ChatSession
    {
        const session = ChatSession.fromExisting(sessionId, parentMessageId);
        this.currentSession = session;
        return session;
    }

    static async validateToken(token: string): Promise<{ valid: boolean; email?: string; error?: string }>
    {
        const headers = HeadersBuilder.getAuthHeaders(token);
        try
        {
            const response = await fetch(API_ENDPOINTS.USERS_CURRENT, { method: "GET", headers });
            if (!response.ok)
            {
                return { valid: false, error: `HTTP ${response.status}` };
            }
            const json = (await response.json()) as unknown;
            if (!isRecord(json) || json.code !== 0)
            {
                const msg = isRecord(json) && typeof json.msg === "string" ? json.msg : "неизвестная ошибка";
                return { valid: false, error: msg || "неизвестная ошибка" };
            }
            const data = getRecord(json, "data");
            const bizData = getRecord(data, "biz_data");
            const email = isRecord(bizData) && typeof bizData.email === "string" ? bizData.email : undefined;
            return { valid: true, email };
        }
        catch (error)
        {
            const message = error instanceof Error ? error.message : String(error);
            return { valid: false, error: message };
        }
    }
}
