# DeepSeek Client

## Обзор

`src/deepseek-client/` — нативная обёртка над API DeepSeek (используется провайдером `deepseek-web`). Обеспечивает создание сессий, отправку сообщений, загрузку истории и валидацию токена.

## Основные компоненты

### DeepseekClient (`client/DeepseekClient.ts`)

Основной класс для взаимодействия с API.

```typescript
class DeepseekClient {
    constructor(token: string)

    // Инициализация (PoW)
    async initialize(): Promise<void>

    // Создание новой чат-сессии
    async createSession(): Promise<ChatSession>

    // Отправка сообщения (возвращает потоковый Response)
    async sendMessage(
        message: string,
        session?: ChatSession | null,
        options?: SendMessageOptions
    ): Promise<Response>

    // Загрузка истории сессии из облака DeepSeek
    async fetchHistory(sessionId: string, signal?: AbortSignal): Promise<DeepseekHistoryData>

    // Загрузка существующей сессии по ID
    loadExistingSession(sessionId: string, parentMessageId?: number | null): ChatSession

    // Статическая валидация токена
    static async validateToken(token: string): Promise<{ valid: boolean; email?: string; error?: string }>
}
```

### ChatSession (`client/ChatSession.ts`)

Управление отдельной сессией чата.

```typescript
class ChatSession {
    static async create(token: string): Promise<ChatSession>
    static fromExisting(sessionId: string, parentMessageId: number | null): ChatSession
    getId(): string
    getParentMessageId(): number | null
}
```

### Конфигурация (`config/`)
- `constants.ts` — эндпоинты API (`COMPLETION`, `HISTORY_MESSAGES`, `USERS_CURRENT`) и настройки чата (`DEFAULT_MODEL`, `DEFAULT_TEMPERATURE`, `DEFAULT_MAX_TOKENS`)
- `headers.ts` — построение заголовков для аутентификации и запросов

### Сервисы (`services/`)
- `PowService.ts` — Proof-of-Work сервис (вычисление хеша для защиты API)

### Утилиты (`utils/`)
- `encoding.ts` — кодирование данных
- `memory.ts` — работа с памятью
- `record.ts` — безопасное чтение полей из JSON-ответов

## SendMessageOptions

```typescript
type SendMessageOptions = {
    model_type?: string | null;      // "default" | "expert" | null (null = авто)
    thinking_enabled?: boolean;      // режим рассуждений
    search_enabled?: boolean;        // веб-поиск
};
```

## Управление сессиями

Сессии DeepSeek хранятся в облаке. Локальные копии можно сохранять через `session-store.ts`.

Команды для работы с сессиями:
- `/session` — информация о текущей сессии
- `/sessions` — список сохранённых сессий (локальных)
- `/load <id>` — загрузить сессию (локальную или DeepSeek по UUID)

## Обработка ошибок

- `sendMessage()` бросает ошибку при не-2xx статусе с кодом и телом ответа
- `fetchHistory()` имеет таймаут 8 секунд и поддержку прерывания через AbortSignal (Ctrl+C)
- `validateToken()` возвращает `{ valid: false, error }` вместо бросания исключений

## Провайдеры

DeepSeek Client используется только провайдером `deepseek-web`. Остальные провайдеры (`openai`, `openrouter`, `claude`, `gemini`, `ollama`, `lm-studio`, `hugging-face`) используют собственные реализации в `src/providers/`.

Переключение между провайдерами: `/provider <id>`.
