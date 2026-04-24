export interface SendMessageOptions {
    thinking_enabled?: boolean;
    search_enabled?: boolean;
    model_type?: ModelType;
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
