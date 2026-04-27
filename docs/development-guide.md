# Руководство для разработчиков

## Настройка окружения

### Требования
- **Bun** (последняя версия)
- **Node.js** 20+ (для некоторых зависимостей)
- **TypeScript** ^5

### Установка
```bash
# Клонирование репозитория
git clone <repo-url>
cd poopseek

# Установка зависимостей
bun install

# Настройка переменных окружения
cp .env.example .env
# Добавьте DEEPSEEK_TOKEN в .env (и токены других провайдеров при необходимости)
```

## Основные команды

```bash
# Разработка
bun run start              # запуск в dev-режиме
bun run check              # проверка типов TypeScript (tsc -b)

# Сборка
bun run build              # сборка в папку build/ + копирование assets
bun run build:exe          # компиляция в .exe файл
bun run compile            # алиас для build:exe

# Прод
./build/poopseek.exe       # запуск скомпилированного бинарника
```

## Структура проекта

```
poopseek/
├── src/
│   ├── agent/            # Логика агента (цикл, контекст, суб-агенты)
│   ├── cli/              # CLI-интерфейс (ввод, рендер, аутентификация, сессии)
│   │   └── views/        # UI-компоненты (choice, confirm, loading, skills)
│   ├── commands/         # Slash-команды (/help, /model, /mcp, /skills, ...)
│   │   └── defs/         # Определения команд
│   ├── deepseek-client/  # Нативная обёртка API DeepSeek
│   │   ├── client/       # DeepseekClient, ChatSession
│   │   ├── config/       # Эндпоинты, заголовки
│   │   ├── services/     # PoW сервис
│   │   └── utils/        # Кодирование, память
│   ├── tools/            # Инструменты (bash, file.*, git.*, memory.*, user.*, ...)
│   │   ├── defs/         # Определения инструментов
│   │   └── utils/        # Вспомогательные утилиты
│   ├── providers/        # LLM-провайдеры (deepseek-web, openai, claude, gemini, ...)
│   ├── mcp/              # MCP-клиент (Model Context Protocol)
│   ├── skills/           # Навыки (Agent Skills specification)
│   ├── variables/        # Подстановка переменных
│   │   └── defs/         # Определения переменных
│   └── bridge/           # Утилиты для потоков DeepSeek
├── assets/
│   └── prompts/          # Системные промпты
├── docs/                 # Документация
└── build/                # Собранные файлы (игнорится в git)
```

## Ключевые концепции

### Контекстный менеджер (`context-manager.ts`)
Хранит историю диалога, ограничивает количество сообщений (30 по умолчанию). Поддерживает refresh (автоматическая переотправка системного промпта при 64K токенов) и compact (ручное сжатие через LLM).

### Streaming AgentLoop (`streaming-loop.ts`)
Основной движок с потоковой обработкой:
1. contextManager готовит промпт (с системным снапшотом и историей)
2. Промпт отправляется в LLM-провайдер
3. streaming-tool-parser в реальном времени детектит JSON-вызовы инструментов
4. Инструменты выполняются через tool-executor
5. Результаты возвращаются в цикл

### Парсинг вызовов инструментов (`tool-call-parser.ts`)
Извлекает JSON-блоки вида:
```json
{
    "tool": "bash",
    "args": { "command": "ls -la" },
    "onError": "continue",
    "onSuccess": "continue"
}
```

### Terminal Input (`terminal-input.ts`)
Расширенный ввод с поддержкой:
- Многострочности (Shift+Enter)
- Автокомплита файлов (Tab после @)
- Автокомплита команд (Tab после /)
- Очереди ввода во время генерации

### Суб-агенты (`sub-agent.ts`)
Изолированные LLM-вызовы через `agent.ask` и `agent.parallel`. Используются для параллельного анализа кода.

## Добавление slash-команды

Создать обработчик в `src/commands/defs/`:

```typescript
// src/commands/defs/my-command.ts
import { writeLine } from "../io";
import type { Command, CommandsContext } from "../types";

export function createMyCommand(context: CommandsContext): Command {
    return {
        name: "/mycommand",
        description: "Описание команды",
        execute: async (args) => {
            writeLine("");
            writeLine("Выполнено!");
            writeLine("");
            return true; // продолжить работу CLI
        },
    };
}
```

Затем зарегистрировать в `commands/index.ts` в функции `createCommandHandlers()`:

```typescript
import { createMyCommand } from "./defs/my-command";
// ...
registerCommand(createMyCommand(context));
```

## Работа с переменными

В системных промптах можно использовать переменные (обрабатываются `VariableProcessor`):
- `{{files}}` — список файлов
- `{{folder}}` — рабочая папка
- `{{is_git_aviabled}}` — наличие git
- `{{os}}` — операционная система
- `{{user}}` — имя пользователя

Кастомные переменные добавляются в `variables/defs/`.

## Отладка

```bash
# Включить verbose-логи (если реализовано)
export DEBUG=poopseek:*
bun run start
```

## Тестирование

Проект пока не имеет тестов. При добавлении новой функциональности рекомендуется писать тесты в `tests/`.

## Known Issues

- На Windows может быть проблема с цветами в старых версиях PowerShell
- Длинные ответы модели могут тормозить рендер markdown
- При форсированном завершении (Ctrl+C) очередь ввода может потеряться

## Contributing

1. Форкните репозиторий
2. Создайте ветку: `git checkout -b feature/amazing-feature`
3. Внесите изменения и проверьте через `bun run check`
4. Сделайте коммит и пуш
5. Откройте Pull Request
