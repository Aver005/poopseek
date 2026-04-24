# Руководство для разработчиков

## Настройка окружения

### Требования
- **Bun** (последняя версия)
- **Node.js** 20+ (для некоторых зависимостей)
- **TypeScript** 5+

### Установка
```bash
# Клонирование репозитория
git clone <repo-url>
cd poopseek

# Установка зависимостей
bun install

# Настройка переменных окружения
cp .env.example .env
# Добавьте DEEPSEEK_TOKEN в .env
```

## Основные команды

```bash
# Разработка
bun run start              # запуск в dev-режиме
bun run check              # проверка типов TypeScript

# Сборка
bun run build              # сборка в папку build/
bun run build:exe          # компиляция в .exe файл

# Прод
./build/poopseek.exe       # запуск скомпилированного бинарника
```

## Структура проекта

```
poopseek/
├── src/
│   ├── agent/            # Логика агента (цикл, контекст)
│   ├── cli/              # CLI-интерфейс (ввод, рендер)
│   ├── commands/         # Slash-команды (/help, /model)
│   ├── deepseek-client/  # Обёртка API DeepSeek
│   ├── tools/            # Инструменты (bash, file.*)
│   └── variables/        # Подстановка переменных
├── assets/
│   └── prompts/          # Системные промпты
├── docs/                 # Документация
└── build/                # Собранные файлы (игнорится в git)
```

## Ключевые концепции

### Контекстный менеджер (`context-manager.ts`)
Хранит историю диалога, ограничивает количество сообщений (40 по умолчанию). Поддерживает compact — сжатие истории через модель.

### AgentLoop (`loop.ts`)
Основной движок:
1. Отправляет запрос в DeepSeek
2. Парсит вызовы инструментов из ответа
3. Выполняет их через ToolExecutor
4. Повторяет, пока модель не вернёт финальный ответ

### Парсинг вызовов инструментов (`tool-call-parser.ts`)
Извлекает JSON-блоки вида:
```json
{
    "tool": "bash",
    "args": { "command": "ls -la" }
}
```

### Terminal Input (`terminal-input.ts`)
Расширенный ввод с поддержкой:
- Многострочности (Shift+Enter)
- Автокомплита файлов (Tab после @)
- Очереди ввода во время генерации

## Добавление slash-команды

Создать обработчик в `src/commands/`:

```typescript
// src/commands/my-command.ts
import type { Command } from "./types.js";

export const myCommand: Command = {
    name: "mycommand",
    description: "Описание команды",
    handler: async (args, context) => {
        // args — аргументы после команды
        // context — зависимости (terminalInput и др.)
        console.log("Выполнено!");
        return true; // продолжить работу CLI
    }
};
```

Затем зарегистрировать в `commands/index.ts`.

## Работа с переменными

В системных промптах можно использовать переменные:
- `{{workspace}}` — текущая рабочая директория
- `{{date}}` — текущая дата
- Кастомные переменные добавляются в `variables/`

## Отладка

```bash
# Включить verbose-логи (если реализовано)
export DEBUG=poopseek:*
bun run start

# Проверка типов в watch-режиме
bun run check --watch
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
