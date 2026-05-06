export interface SendMessageOptions {
    thinking_enabled?: boolean;
    search_enabled?: boolean;
    model_type?: ModelType;
    signal?: AbortSignal;
    ref_file_ids?: string[];
}

export type DeepseekFileStatus = "PENDING" | "SUCCESS" | "FAILED";

export interface DeepseekFileInfo {
    id: string;
    status: DeepseekFileStatus;
    file_name: string;
    is_image: boolean;
}

export type ModelType = "default" | "expert";

export interface ChatPayload {
    prompt: string;
    model: string;
    model_type: ModelType | null;
    stream: boolean;
    temperature: number;
    max_tokens: number;
    ref_file_ids: string[];
    thinking_enabled: boolean;
    search_enabled: boolean;
    chat_session_id: string;
    parent_message_id: number | null;
}

export interface PowChallenge {
    algorithm: string;
    answer: number | null;
    challenge: string;
    difficulty: string;
    expire_at: number;
    salt: string;
    signature: string;
    target_path: string;
}

export interface DeepseekHistoryFragment {
    id: number;
    type: string;
    content: string;
}

export interface DeepseekHistoryMessage {
    message_id: number;
    parent_id: number | null;
    role: string;
    status: string;
    fragments: DeepseekHistoryFragment[];
}

export interface DeepseekHistoryChatSession {
    id: string;
    title: string;
    current_message_id: number;
}

export interface DeepseekHistoryData {
    chat_session: DeepseekHistoryChatSession;
    chat_messages: DeepseekHistoryMessage[];
}
