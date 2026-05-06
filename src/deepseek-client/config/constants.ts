export const DEEPSEEK_HOST = "chat.deepseek.com";

export const API_ENDPOINTS = {
    CREATE_POW: `https://${DEEPSEEK_HOST}/api/v0/chat/create_pow_challenge`,
    COMPLETION: `https://${DEEPSEEK_HOST}/api/v0/chat/completion`,
    CREATE_SESSION: `https://${DEEPSEEK_HOST}/api/v0/chat_session/create`,
    HISTORY_MESSAGES: `https://${DEEPSEEK_HOST}/api/v0/chat/history_messages`,
    USERS_CURRENT: `https://${DEEPSEEK_HOST}/api/v0/users/current`,
    UPLOAD_FILE: `https://${DEEPSEEK_HOST}/api/v0/file/upload_file`,
    FETCH_FILES: `https://${DEEPSEEK_HOST}/api/v0/file/fetch_files`,
    TARGET_PATH: "/api/v0/chat/completion",
    FILE_TARGET_PATH: "/api/v0/file/upload_file",
} as const;

export const FILE_CONFIG = {
    POLL_INTERVAL_MS: 1000,
    POLL_TIMEOUT_MS: 30000,
} as const;

export const WASM_CONFIG = {
    DEFAULT_PATH: "./assets/sha3_wasm_bg.7b9ca65ddd.wasm",
    SUPPORTED_ALGORITHMS: ["DeepSeekHashV1"],
} as const;

export const CHAT_CONFIG = {
    DEFAULT_MODEL: "deepseek-chat",
    DEFAULT_TEMPERATURE: 0.7,
    DEFAULT_MAX_TOKENS: 4096,
} as const;
