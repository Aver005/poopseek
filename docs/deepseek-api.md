# DeepSeek API и конфигурация

## Обзор

PoopSeek использует официальное API DeepSeek через кастомную обёртку в `src/deepseek-client/`. Поддерживаются потоковые ответы и сессии.

## Конфигурация

### Переменные окружения

```bash
# .env
DEEPSEEK_TOKEN=your-api-key-here
DEEPSEEK_MODEL=deepseek-chat  # опционально, по умолчанию deepseek-chat
DEEPSEEK_API_URL=https://api.deepseek.com/v1  # опционально
```

### Файл конфигурации

При первом запуске создаётся `.poopseek.json` в корне проекта:

```json
{
    "token": "your-api-key",
    "model": "deepseek-chat",
    "version": "1.0.0"
}
```

## API клиент

### Основные методы

```typescript
// src/deepseek-client/client.ts
export class DeepSeekClient {
    // Отправка сообщения с потоковым ответом
    async *streamChat(messages: Message[], options?: StreamOptions): AsyncGenerator<StreamChunk>
    
    // Компактное сжатие истории
    async compact(messages: Message[]): Promise<Message>
}
```

### Формат сообщений

```typescript
type Message = {
    role: "system" | "user" | "assistant" | "tool";
    content: string;
    tool_calls?: ToolCall[];      // для assistant
    tool_call_id?: string;        // для tool
}

type ToolCall = {
    id: string;
    type: "function";
    function: {
        name: string;
        arguments: string;        // JSON строка
    }
}
```

### Потоковые чанки

```typescript
type StreamChunk = {
    type: "content" | "tool_call" | "done" | "error";
    content?: string;              // для type="content"
    toolCall?: ToolCall;           // для type="tool_call"
    error?: string;                // для type="error"
}
```

## Управление сессией

Клиент поддерживает автоматическое сохранение сессии между запусками через `session-manager.ts`:

```typescript
// Сохранение истории сессии
await sessionManager.save(messages);

// Восстановление при следующем запуске
const messages = await sessionManager.load();
```

Сессии хранятся в `~/.poopseek/sessions/`.

## Модели

Доступные модели DeepSeek:
- `deepseek-chat` — стандартная (по умолчанию)
- `deepseek-coder` — для задач программирования

Сменить модель можно командой `/model deepseek-coder`.

## Ограничения API

- **Max tokens**: 4096 на запрос (можно изменить в клиенте)
- **Context window**: 128K токенов (DeepSeek поддерживает до 1M, но PoopSeek лимитирует до 128K для производительности)
- **Rate limit**: зависит от тарифа (обычно 10-100 запросов/минуту)

## Пример: ручной вызов API

```typescript
import { DeepSeekClient } from "./deepseek-client/client.js";

const client = new DeepSeekClient({
    token: process.env.DEEPSEEK_TOKEN,
    model: "deepseek-chat"
});

const messages = [
    { role: "system", content: "You are a helpful assistant" },
    { role: "user", content: "What is 2+2?" }
];

for await (const chunk of client.streamChat(messages)) {
    if (chunk.type === "content") {
        process.stdout.write(chunk.content);
    }
}
```

## Обработка ошибок

Клиент автоматически обрабатывает:
- Невалидный токен (401) — предложит ввести новый
- Rate limit (429) — exponential backoff с повторами
- Таймауты (504) — повтор с увеличением таймаута

## Переключение провайдеров

Для использования OpenAI или других провайдеров нужно реализовать адаптер в `src/llm-providers/`. См. `docs/adding-providers.md` (будет добавлено).
