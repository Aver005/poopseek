# Добавление новых инструментов

## Структура инструмента

Каждый инструмент определяется в `src/tools/defs/` и состоит из:
- **name** — строка-идентификатор для вызова моделью (например, `"bash"`, `"file.read"`)
- **handler** — асинхронная функция с сигнатурой `ToolHandler`

Типы определены в `src/tools/types.ts` и `src/agent/types.ts`:

```typescript
// src/agent/types.ts
export interface ToolExecutionResult {
    ok: boolean;      // успех или ошибка
    output: string;   // текстовый результат (будет передан модели)
    data?: unknown;   // опциональные структурированные данные
    error?: string;   // опциональное сообщение об ошибке
}
```

## Шаги по добавлению

### 1. Создать файл в `src/tools/defs/`

Каждый инструмент экспортирует `name` (string) и `handler` (ToolHandler):

```typescript
// src/tools/defs/my-tool.ts
import type { ToolHandler } from "../types";

export const name = "my_tool";

export const handler: ToolHandler = async (args, context) => {
    // args — объект с аргументами, переданными моделью
    // context — ToolContext (workspaceRoot, resolvePath, runCommand, askUser и др.)
    const result = await doSomething(args.param1, args.param2);
    return {
        ok: true,
        output: JSON.stringify(result),
        data: result,
    };
};
```

### 2. Зарегистрировать в `src/tools/index.ts`

Импортировать `handler` и `name` и добавить в `toolsRegistry`:

```typescript
import { handler as myToolHandler, name as myToolName } from "./defs/my-tool";

export const toolsRegistry: Record<string, ToolHandler> = {
    // ...существующие инструменты...
    [myToolName]: myToolHandler,
};
```

### 3. Инструмент готов

`tool-executor.ts` использует `toolsRegistry` для поиска обработчика по имени. Модель получит имя инструмента через системный промпт.

## ToolContext — доступные возможности

```typescript
// src/tools/types.ts
export interface ToolContext {
    workspaceRoot: string;
    getToolNames: () => string[];
    resolvePath: (inputPath: string) => string;
    runCommand: (kind: "powershell" | "bash", args: Record<string, unknown>) => Promise<CommandResult>;
    askUser: AskUserFn;
    getSkillContent?: (name: string) => string | null;
    spawnSubAgent?: (task: SubAgentTask) => Promise<SubAgentResult>;
    spawnSubAgents?: (tasks: SubAgentTask[]) => Promise<SubAgentResult[]>;
    onProgress?: (message: string) => void;
}
```

## Примеры из кодовой базы

### file.read — чтение файла

```typescript
// src/tools/defs/file-read.ts
import fs from "node:fs";
import { toStringValue } from "../args";
import type { ToolHandler } from "../types";

export const name = "file.read";

export const handler: ToolHandler = async (args, context) => {
    const requestedPath = toStringValue(args.path);
    if (!requestedPath) {
        throw new Error("Missing required args.path");
    }
    const targetPath = context.resolvePath(requestedPath);
    const content = await fs.promises.readFile(targetPath, "utf8");
    return {
        ok: true,
        output: content,
        data: { path: targetPath, content },
    };
};
```

### bash — выполнение bash-команды

```typescript
// src/tools/defs/bash.ts
import type { ToolHandler } from "../types";

export const name = "bash";

export const handler: ToolHandler = async (args, context) => {
    const result = await context.runCommand("bash", args);
    return {
        ok: result.code === 0,
        output: result.stdout.trim().length > 0 ? result.stdout : result.stderr,
        data: result,
        error: result.code === 0 ? undefined : result.stderr,
    };
};
```

## Best Practices

1. **Безопасность** — используйте `context.resolvePath()` для валидации путей, не позволяйте выходить за пределы workspace
2. **Асинхронность** — все хендлеры async
3. **Сообщения об ошибках** — при `ok: false` заполняйте поле `error` понятным сообщением
4. **Структурированные данные** — поле `data` удобно для передачи машиночитаемых результатов
5. **Таймауты** — долгие операции должны иметь таймаут
