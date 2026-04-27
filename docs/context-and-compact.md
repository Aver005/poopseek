# Управление контекстом и сжатие истории

## Обзор

PoopSeek поддерживает длительные диалоги через управление контекстом. Система предотвращает переполнение контекстного окна двумя механизмами: автоматический **refresh** (переотправка системного промпта) и ручной **compact** (сжатие истории через LLM).

## Контекстный менеджер (`context-manager.ts`)

### Основные методы

```typescript
class ContextManager {
    // Добавление сообщений в историю
    addUser(content: string): void
    addAssistant(content: string): void
    addTool(name: string, content: string): void

    // Подготовка промпта для отправки в API
    prepareUserTurn(content: string): PreparedTurnMessage
    prepareToolTurn(name: string, content: string): PreparedTurnMessage
    prepareToolBatchTurn(results: Array<{ name: string; content: string }>): PreparedTurnMessage

    // Сжатие истории (суммаризация через LLM)
    replaceWithCompactSummary(summary: string): void

    // Очистка истории
    clearHistory(): void

    // Экспорт/восстановление состояния
    exportState(): ContextManagerState
    restoreState(state: ContextManagerState): void

    // Навыки и MCP
    setSkillsContent(content: string): void
    setAvailableSkillsHint(hint: string): void
    setMCPToolsDoc(doc: string): void
    setMCPResourcesContext(context: string): void

    // Статистика
    getMessageCount(): number
    getApproxTokensSinceRefresh(): number
    getDialogueSnapshot(): string
}
```

### Ограничения

- **Максимум сообщений**: 30 по умолчанию (настраивается в `context-manager.ts`: `maxMessages`)
- **Refresh**: при накоплении ~64 000 токенов (приблизительно, `refreshEveryApproxTokens`) система автоматически переотправляет системный промпт
- **Подсчёт токенов**: приблизительный, 1 токен ≈ 4 символа (`Math.ceil(normalized.length / 4)`)

### Типы сообщений

```typescript
// Системный промпт (всегда первым)
{ role: "system", content: "You are..." }

// Пользовательский ввод
{ role: "user", content: "Hello!" }

// Ответ ассистента
{ role: "assistant", content: "Hi there!" }

// Результат выполнения инструмента
{ role: "tool", name: "bash", content: "file.txt" }
```

## Механизм refresh

Refresh — это автоматическая переотправка системного промпта при приближении к лимиту токенов. В отличие от compact, refresh не сжимает историю — он повторно вставляет системный снапшот (SYSTEM SNAPSHOT + TOOLS SNAPSHOT), чтобы модель не забыла базовые инструкции.

Срабатывает когда `approxTokensSinceRefresh >= refreshEveryApproxTokens` (по умолчанию 64 000).

## Механизм compact

### Как работает

1. Пользователь вызывает `/compact` (или `/cmpt`)
2. Модель получает запрос: *"Резюмируй наш разговор на русском в одном абзаце. Сохрани ключевые факты, важные договорённости, архитектурные решения и текущий контекст задачи. Максимум 5 предложений."*
3. Модель возвращает резюме
4. История заменяется на одно сообщение с префиксом `# COMPACT CONTEXT`

### Ручной compact

```bash
# Сжать всю историю
/compact

# Сжать последние N сообщений
/compact 20
```

### Автоматический compact

**Не реализован.** Compact вызывается только вручную пользователем. Автоматически срабатывает только refresh.

### Пример сжатия

**До compact (15 сообщений):**
```
[system] You are a Python expert
[user] Как создать список?
[assistant] Используйте [1, 2, 3]
[user] А как добавить элемент?
[assistant] Используйте .append()
... ещё 10 сообщений про Python
```

**После compact:**
```
[assistant] # COMPACT CONTEXT

Пользователь изучает Python: списки, .append(), словари, циклы for, функции...
```

## Сохранение сессий

### Локальные сессии

Сессии сохраняются в `~/.poopseek/sessions/` (по одной на файл `<session_id>.json`). Модуль: `src/cli/session-store.ts`.

- `/session` — показать информацию о текущей сессии
- `/sessions` — открыть список сохранённых сессий с возможностью загрузки
- `/load <id>` — загрузить сессию по ID

### DeepSeek-сессии

При использовании провайдера `deepseek-web` можно загружать сессии из облака DeepSeek через `/load <chat_session_id>`.

## Влияние инструментов на контекст

Инструментальные вызовы и их результаты занимают много места. Рекомендации:

- Используйте `/compact` после серии из 5-10 инструментальных вызовов
- Ограничивайте вывод команд через `head -n 20`
- Для больших файлов используйте `file.read` — вывод и так ограничен

## Настройка лимитов

В `src/agent/context-manager.ts`:

```typescript
const DEFAULT_OPTIONS: ContextManagerOptions = {
    maxMessages: 30,
    refreshEveryApproxTokens: 64_000,
};
```

Для изменения отредактируйте файл и пересоберите проект.

## Статистика контекста

- `/stats` — показать количество сообщений, примерное количество токенов с последнего refresh
