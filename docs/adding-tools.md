# Добавление новых инструментов

## Структура инструмента

Каждый инструмент определяет:
- **name** — имя для вызова моделью
- **description** — описание того, что делает инструмент
- **schema** — JSON Schema аргументов
- **handler** — функция выполнения

## Шаги по добавлению

### 1. Создать файл в `src/tools/defs/`

```typescript
// src/tools/defs/my-tool.ts
import type { ToolDefinition } from "../types.js";

export const myTool: ToolDefinition = {
    name: "my_tool",
    description: "Что делает этот инструмент",
    schema: {
        type: "object",
        properties: {
            param1: {
                type: "string",
                description: "Первый параметр"
            },
            param2: {
                type: "number",
                description: "Второй параметр"
            }
        },
        required: ["param1"]
    },
    handler: async (args) => {
        // args.param1, args.param2
        const result = await doSomething(args.param1, args.param2);
        return {
            ok: true,
            content: JSON.stringify(result)
        };
    }
};
```

### 2. Экспортировать в `src/tools/defs/index.ts`

```typescript
export { bashTool } from "./bash.js";
export { fileReadTool } from "./file-read.js";
export { myTool } from "./my-tool.js"; // <- добавить
```

### 3. Инструмент автоматически подключится

`tool-executor.ts` сканирует все экспортированные инструменты из `defs/`.

## Формат ответа хендлера

```typescript
type ToolResult = {
    ok: boolean;      // успех или ошибка
    content: string;  // результат (будет передан модели)
    error?: string;   // опциональное сообщение об ошибке
};
```

## Доступные утилиты

- `args.ts` — парсинг аргументов инструментов
- `ToolExecutor` имеет доступ к `workspaceRoot` и может выполнять системные команды через `bash`

## Пример: инструмент для чтения файла

```typescript
export const fileReadTool: ToolDefinition = {
    name: "file.read",
    description: "Read file content from the workspace",
    schema: {
        type: "object",
        properties: {
            path: { type: "string", description: "Path relative to workspace" }
        },
        required: ["path"]
    },
    handler: async (args, context) => {
        const fullPath = path.join(context.workspaceRoot, args.path);
        const content = await fs.readFile(fullPath, "utf-8");
        return { ok: true, content };
    }
};
```

## Best Practices

1. **Безопасность** — валидируйте пути, не позволяйте выходить за пределы workspace
2. **Асинхронность** — хендлеры всегда async
3. **Сообщения об ошибках** — пишите понятные сообщения в `error` поле
4. **JSON-результаты** — структурированные данные удобно отдавать в JSON
5. **Таймауты** — долгие операции должны иметь таймаут
