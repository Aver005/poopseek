# Архитектура PoopSeek

## Обзор

PoopSeek — CLI-агент с поддержкой инструментов (tools), навыков (skills), MCP-серверов и множества LLM-провайдеров. Написан на TypeScript, работает на Bun.

## Основные компоненты

### 1. CLI-слой (`src/cli/`)
- `run-cli.ts` — точка входа, оркестрация всех компонентов
- `terminal-input.ts` — обработка ввода с автокомплитом файлов и команд
- `terminal-capabilities.ts` — определение возможностей терминала
- `markdown.ts` — рендер markdown в терминале
- `colors.ts` — управление цветами и темами
- `runtime-config.ts` — хранение токена, провайдера и настроек в `%APPDATA%/poopseek/config.json`
- `auth-flow.ts` — поток аутентификации (ввод токена, onboarding)
- `onboarding.ts` — приветственный экран при первом запуске
- `session-store.ts` — сохранение/загрузка сессий в `~/.poopseek/sessions/`
- `file-mentions.ts` — обработка синтаксиса `@path/to/file`
- `prompt-files.ts` — загрузка файлов, упомянутых через `@`
- `input-queue.ts` — очередь ввода во время генерации
- `sidechat.ts` — фоновые запросы (`/btw`)
- `command-hints.ts` — подсказки команд
- `generation-indicator.ts` — индикатор генерации
- `tool-progress-messages.ts` — сообщения о прогрессе инструментов
- `view-manager.ts` — управление UI-компонентами
- `refactor.ts` / `review.ts` — поддержка рефакторинга и код-ревью
- `views/` — UI-компоненты: `choice.ts`, `confirm.ts`, `loading.ts`, `skills.ts`

### 2. Агент (`src/agent/`)
- `loop.ts` — основной цикл: запрос к LLM → парсинг вызовов инструментов → выполнение → продолжение
- `streaming-loop.ts` — потоковый цикл с real-time детекцией инструментов
- `streaming-tool-parser.ts` — потоковый парсер инструментов с буферизацией JSON
- `context-manager.ts` — управление историей сообщений (максимум 30 сообщений, механизм refresh при 64K токенов)
- `tool-executor.ts` — диспетчер вызовов инструментов через `toolsRegistry`
- `tool-call-parser.ts` — извлечение вызовов инструментов из ответа модели
- `sub-agent.ts` — запуск изолированных суб-агентов для параллельного анализа
- `types.ts` — типы `AgentMessage`, `ToolCallEnvelope`, `ToolExecutionResult`, `AgentTurnResult`

### 3. Инструменты (`src/tools/`)
Определены в `defs/`, зарегистрированы в `index.ts`. Каждый инструмент экспортирует `name` и `handler`.

Доступные инструменты (22):
`tools.list`, `todo.write`, `todo.read`, `bash`, `powershell`, `file.find`, `file.list`, `file.read`, `file.write`, `file.edit`, `file.remove`, `git`, `git.edit`, `memory.save`, `memory.read`, `memory.list`, `user.ask`, `user.choice`, `user.confirm`, `skill.read`, `agent.ask`, `agent.parallel`

Вспомогательные модули: `args.ts` (парсинг аргументов), `utils/` (`memory-path.ts`, `todo-store.ts`, `write-text-file.ts`).

### 4. Провайдеры (`src/providers/`)
Абстракция над разными LLM API. Фабрика `createProvider()` в `index.ts`.

Поддерживаемые провайдеры:
- `deepseek-web` — нативное API DeepSeek (через `DeepseekClient` в `src/deepseek-client/`)
- `openai` — OpenAI API
- `openrouter` — OpenRouter API
- `hugging-face` — Hugging Face Inference API
- `claude` — Anthropic Claude API
- `gemini` — Google Gemini API
- `ollama` — локальный Ollama
- `lm-studio` — локальный LM Studio

Типы: `ILLMProvider`, `ProviderCallOptions`, `ProviderConfig`, `ProviderInfo` в `types.ts`.

### 5. DeepSeek Client (`src/deepseek-client/`)
Нативная обёртка над API DeepSeek (используется провайдером `deepseek-web`):
- `client/DeepseekClient.ts` — основной клиент: `createSession()`, `sendMessage()`, `fetchHistory()`, `validateToken()`
- `client/ChatSession.ts` — управление сессией чата
- `config/constants.ts` — эндпоинты и настройки
- `config/headers.ts` — построение заголовков
- `services/PowService.ts` — Proof-of-Work сервис
- `utils/` — кодирование, память, утилиты для записей

### 6. Команды (`src/commands/`)
Обработчики slash-команд. Регистрация в `index.ts` через `createCommandHandlers()`.

27 команд: `/auth`, `/btw`, `/clear`, `/cmpt`, `/compact`, `/exit`, `/help`, `/history`, `/load`, `/logout`, `/maestro`, `/mcp`, `/model`, `/noob`, `/provider`, `/quit`, `/refactor`, `/review`, `/session`, `/sessions`, `/skills`, `/skills-folder`, `/stats`, `/switch`, `/theme`, `/think`, `/tools`, `/web`

Вспомогательные модули: `io.ts` (writeLine), `types.ts` (Command, CommandsContext).

### 7. MCP-клиент (`src/mcp/`)
Поддержка Model Context Protocol:
- `manager.ts` — `MCPManager`: подключение к MCP-серверам, обнаружение tools/resources/prompts
- `config.ts` — загрузка конфигурации MCP-серверов
- `types.ts` — `MCPServerConfig`, `MCPToolInfo`, `MCPResourceInfo` и др.

### 8. Навыки (`src/skills/`)
Поддержка Agent Skills specification:
- `index.ts` — `SkillManager` и `discoverSkills()`
- `skill-folders-store.ts` — хранение пользовательских папок с навыками

Поиск навыков в 30+ стандартных директориях (`.claude/skills`, `.trae/skills`, `skills/` и др.) плюс пользовательские папки.

### 9. Переменные (`src/variables/`)
Подстановка переменных в промпты. Определены в `defs/`:
- `files.ts` — список файлов
- `folder.ts` — рабочая папка
- `is-git-aviabled.ts` — наличие git
- `os.ts` — операционная система
- `user.ts` — имя пользователя

### 10. Bridge (`src/bridge/`)
Утилиты для работы с потоками DeepSeek:
- `deepseek-stream.ts` — базовый потоковый парсер
- `deepseek-stream-enhanced.ts` — улучшенная версия стриминга

## Поток данных

```
Пользовательский ввод
    ↓
terminal-input (обработка @файлов, многострочность, очередь)
    ↓
handleCommand (если /команда)
    ↓
streaming-loop.runTurn()
    ↓
contextManager.prepareUserTurn() → промпт с системным снапшотом
    ↓
LLM Provider (DeepSeek / OpenAI / Claude / Gemini / ...)
    ↓
streaming-tool-parser (потоковый парсинг JSON-вызовов)
    ↓
tool-executor.execute()
    ↓
результат → contextManager.prepareToolTurn() → обратно в loop
    ↓
renderMarkdown() → вывод
```

## Ключевые особенности

### Мульти-провайдер
Поддержка 8 провайдеров. Переключение через `/provider` или `/switch`.

### MCP-интеграция
Подключение к MCP-серверам (stdio и HTTP), автоматическое обнаружение инструментов, ресурсов и промптов.

### Навыки (Skills)
Совместимость с Agent Skills specification. Поиск в 30+ стандартных директориях, активация через `/skills`.

### Очередь ввода
Во время генерации ответа новый ввод не теряется, а добавляется в очередь.

### Файловые упоминания
Синтаксис `@path/to/file` автоматически читает файлы и добавляет их в контекст.

### Sidechat (`/btw <вопрос>`)
Фоновый запрос без прерывания основного диалога.

### Суб-агенты
Изолированные LLM-вызовы для параллельного анализа через `agent.ask` и `agent.parallel`.

### Compact и Refresh
- `/compact` — сжатие истории через LLM (модель резюмирует диалог)
- Refresh — автоматическая переотправка системного промпта при превышении ~64K токенов

## Зависимости

- **Bun** — runtime и сборщик
- **terminal-kit** — продвинутый терминальный ввод
- **@modelcontextprotocol/sdk** — MCP-клиент
- **openai** — OpenAI-совместимый клиент для провайдеров
- **TypeScript** — типизация

## Сборка

```bash
bun run start      # запуск в dev-режиме
bun run build      # собрать в build/
bun run build:exe  # скомпилировать в .exe
bun run compile    # алиас для build:exe
bun run check      # проверка типов TypeScript
```

## Конфигурация

- `.env` — переменные окружения (`DEEPSEEK_TOKEN` и токены других провайдеров)
- `%APPDATA%/poopseek/config.json` — сохранённый токен, провайдер, имя пользователя, статус onboarding
- `~/.poopseek/sessions/` — сохранённые сессии
- `assets/prompts/` — системные промпты
- `.poopseek/mcp.json` — конфигурация MCP-серверов (в рабочей папке)
