# Продвинутый план улучшения PoopSeek

**Версия плана:** 2.0.0  
**Дата:** 2026-04-28  
**Цель:** Устранить критические уязвимости, повысить надёжность и масштабируемость агента

---

## Executive Summary

План разделён на **4 фазы** по 2-4 недели каждая, с приоритетом безопасности и стабильности.  
После выполнения всех фаз PoopSeek достигнет **production-grade** уровня.

| Фаза | Фокус | Длительность | Риск |
|------|-------|--------------|------|
| 0️⃣ | Быстрые победы (критические уязвимости) | 3-5 дней | 🔴 HIGH |
| 1️⃣ | Архитектурная стабилизация | 2 недели | 🟡 MEDIUM |
| 2️⃣ | Производительность и масштабирование | 3 недели | 🟢 LOW |
| 3️⃣ | Расширение экосистемы | 4 недели | 🟢 LOW |

---

## Фаза 0: Быстрые победы (Безопасность и стабильность)

**Цель:** Устранить критические уязвимости за 3-5 дней.

### 0.1 Исправление Command Injection 🔴 CRITICAL
**Проблема:** `ToolExecutor.runCommand()` конкатенирует пользовательский ввод без экранирования.

**Решение:** Перейти на аргументные массивы с экранированием.

**Новая реализация:**
```typescript
// Быстрое исправление — использовать безопасную обёртку
import { escapeShellArg } from '@/utils/shell-escape';

const safeCommand = command.split(' ').map(escapeShellArg).join(' ');
const cmd = kind === 'powershell'
    ? ['powershell', '-NoProfile', '-Command', safeCommand]
    : ['bash', '-lc', safeCommand];
```

**Долгосрочно:** Использовать `Bun.spawn` с аргументами без шелла.

### 0.2 Добавление Retry-логики для API 🔴 CRITICAL
**Проблема:** `agent/loop.ts` не обрабатывает временные сбои DeepSeek.

**Решение:** Реализовать экспоненциальную задержку.
```typescript
async function withRetry<T>(
    fn: () => Promise<T>,
    maxRetries = 3,
    baseDelay = 1000
): Promise<T> {
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await fn();
        } catch (error) {
            if (i === maxRetries - 1) throw error;
            const delay = baseDelay * Math.pow(2, i);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    throw new Error('Unreachable');
}
```

### 0.3 Включение TypeScript строгих проверок 🟡 HIGH
**tsconfig.json:**
```json
{
    "compilerOptions": {
        "noUnusedLocals": true,
        "noUnusedParameters": true,
        "noImplicitReturns": true,
        "noFallthroughCasesInSwitch": true,
        "strictNullChecks": true
    }
}
```

### 0.4 Добавление rate limiting для инструментов 🟡 HIGH
**Защита от DoS:** ограничить выполнение опасных инструментов.
**Решение:** Rate limiter через `bottleneck` или кастомный Token Bucket.
```typescript
const toolRateLimits = {
    bash: { limit: 5, window: 60000 },      // 5 вызовов в минуту
    powershell: { limit: 5, window: 60000 },
    fileWrite: { limit: 20, window: 60000 },
    git: { limit: 10, window: 60000 }
};
```

---

## Фаза 1: Архитектурная стабилизация

**Цель:** Устранить технический долг и повысить тестируемость.

### 1.1 Внедрение Unit-тестов 🟡 HIGH
**Добавить Vitest:**
```bash
bun add -d vitest @vitest/coverage-v8
```

**Критические тесты:**
```typescript
// tests/agent/context-manager.test.ts
describe('ContextManager', () => {
    it('should trim messages correctly', () => { ... });
    it('should estimate tokens roughly', () => { ... });
    it('should refresh context when token budget exceeded', () => { ... });
});

// tests/agent/tool-executor.test.ts
describe('ToolExecutor', () => {
    it('should prevent path traversal', () => { ... });
    it('should timeout long-running commands', () => { ... });
});

// tests/tools/parsers.test.ts
describe('parseMessage', () => {
    it('should extract JSON tool calls correctly', () => { ... });
    it('should handle malformed JSON gracefully', () => { ... });
});
```

**Цель:** Достичь 70% покрытия кода к концу фазы.

### 1.2 Рефакторинг монолитного CLI 🟡 MEDIUM
**Сейчас:** `run-cli.ts` — 500+ строк.
**Новая структура:**
```
src/cli/
├── bootstrap/           # Инициализация и загрузка конфигов
│   ├── config-loader.ts
│   ├── provider-factory.ts
│   └── session-manager.ts
├── ui/                  # Пользовательский интерфейс
│   ├── terminal-input.ts
│   ├── view-manager.ts
│   └── progress-indicator.ts
└── orchestrator.ts      # 150 строк — только координация
```

### 1.3 Внедрение Result Type для ошибок 🟢 LOW
**Стандартизация ошибок:**
```typescript
type Result<T, E = Error> =
    | { ok: true; value: T }
    | { ok: false; error: E };

// Применение
async function runCommand(command: string): Promise<Result<string>> {
    try {
        const output = await execute(command);
        return { ok: true, value: output };
    } catch (error) {
        return { ok: false, error: error as Error };
    }
}
```

### 1.4 Система логирования 🟢 LOW
**Замена `console.log`:**
```typescript
// src/logger.ts
export const logger = {
    debug: (...args: any[]) => process.env.DEBUG && console.error('[DEBUG]', ...args),
    info: (...args: any[]) => console.error('[INFO]', ...args),
    warn: (...args: any[]) => console.error('[WARN]', ...args),
    error: (...args: any[]) => console.error('[ERROR]', ...args)
};
```

---

## Фаза 2: Производительность и масштабирование

**Цель:** Оптимизировать работу с большими контекстами и ускорить отклик.

### 2.1 Точный подсчёт токенов 🟡 MEDIUM
**Заменить `estimateApproxTokens()`:**
```bash
bun add tiktoken
```

**Интеграция:**
```typescript
import { encoding_for_model } from 'tiktoken';

class AccurateTokenCounter {
    private enc = encoding_for_model('gpt-4'); // DeepSeek-совместимый
    count(text: string): number {
        return this.enc.encode(text).length;
    }
}
```

**Бюджет:** Установить `refreshEveryApproxTokens: 120_000` (120K токенов DeepSeek).

### 2.2 Кэширование инструментов 🟡 MEDIUM
**Проблема:** Повторные вызовы `file.read` на больших файлах.
**Решение:** LRU-кэш на 100МБ.
```typescript
import QuickLRU from 'quick-lru';

const fileCache = new QuickLRU<string, string>({ maxSize: 100 }); // 100 entries

async function readFileWithCache(path: string): Promise<string> {
    if (fileCache.has(path)) return fileCache.get(path)!;
    const content = await Bun.file(path).text();
    fileCache.set(path, content);
    return content;
}
```

### 2.3 Потоковое выполнение пачки инструментов 🟢 LOW
**Сейчас:** Последовательное выполнение.
**Улучшение:** Параллельное выполнение независимых инструментов.
```typescript
// В agent/loop.ts
const independentToolCalls = parsed.toolCalls.filter(tc => !tc.hasSideEffects);
const results = await Promise.allSettled(
    independentToolCalls.map(tc => executeTool(tc))
);
```

### 2.4 Персистентная сессия шелла 🚀 STRETCH
**Проблема:** `Bun.spawn` для каждой команды — накладные расходы.
**Решение:** Держать открытый процесс шелла для сессии.
```typescript
class PersistentShell {
    private process: Subprocess;
    private queue: Array<{
        cmd: string;
        resolve: (value: string) => void;
        reject: (error: Error) => void;
    }> = [];

    async exec(command: string): Promise<string> {
        // Отправляем команду через stdin, читаем stdout/stderr
    }
}
```

---

## Фаза 3: Расширение экосистемы

**Цель:** Добавить enterprise-фичи и интеграции.

### 3.1 MCP-сервер как отдельный процесс 🟡 MEDIUM
**Архитектура:** Выделить MCP в дочерний процесс для изоляции.
```typescript
// src/mcp/mcp-host.ts
export class MCPHost {
    private childProcess: ChildProcess;
    async initialize(): Promise<void> {
        this.childProcess = spawn('bun', ['src/mcp/server.ts']);
        // JSON-RPC коммуникация через stdin/stdout
    }
}
```

### 3.2 Поддержка пользовательских инструментов (plugins) 🟡 MEDIUM
**Пользовательские инструменты из `~/.poopseek/tools/`:**
```typescript
// Загрузка динамических инструментов
const userTools = await loadUserTools();
userTools.forEach(tool => toolsRegistry[tool.name] = tool.handler);
```
**Формат:**
```typescript
// my-custom-tool.ts
export default {
    name: 'my-tool',
    description: 'Does something cool',
    parameters: { ... },
    execute: async (args, context) => { ... }
};
```

### 3.3 Веб-интерфейс (опционально) 🟢 LOW
**API сервер на Hono:**
```bash
bun add hono
```
**Эндпоинты:**
- `POST /api/chat` — отправить сообщение
- `GET /api/sessions` — список сессий
- `WS /api/stream` — веб-сокет для стриминга

### 3.4 Шифрование сессий 🔒 MEDIUM
**Защита чувствительных данных:**
```bash
bun add @node-rs/argon2
```
**Схема:** Шифровать session-файлы мастер-ключом из конфига.

---

## Метрики успеха (KPIs)

| Фаза | Метрика | Текущее | Цель |
|------|---------|---------|------|
| 0 | Время отклика на API error | 0s (crash) | 5s (с retry) |
| 1 | Покрытие кода тестами | 0% | 70% |
| 1 | Количество TypeScript errors | ~15 suppressed | 0 |
| 2 | Токенов на вызов (среднее) | ~80K | ~40K (-50%) |
| 2 | Время выполнения 10 инструментов | 5-10s | <3s |
| 3 | Время запуска агента | 2.5s | 1.2s |

---

## Рекомендации по внедрению

### Неделя 1 (Фаза 0)
- [x] Проанализировать текущее состояние
- [ ] Исправить command injection (4 часа)
- [ ] Добавить retry-логику (2 часа)
- [ ] Включить строгие TypeScript правила (1 час)

### Неделя 2-3 (Фаза 1)
- [ ] Настроить Vitest и написать базовые тесты (10 часов)
- [ ] Рефакторинг `run-cli.ts` (8 часов)
- [ ] Внедрение Result Type (3 часа)

### Неделя 4-6 (Фаза 2)
- [ ] Интеграция tiktoken (4 часа)
- [ ] Кэширование файлов (3 часа)
- [ ] Параллельное выполнение инструментов (5 часов)

### Неделя 7-10 (Фаза 3)
- [ ] Плагины (пользовательские инструменты)
- [ ] Веб-интерфейс (опционально)

---

## Бюджет времени (часы)

| Категория | Часов |
|-----------|-------|
| 🔴 CRITICAL (безопасность) | 8 |
| 🟡 HIGH (стабильность) | 24 |
| 🟡 MEDIUM (производительность) | 18 |
| 🟢 LOW (фичи) | 20 |
| **Итого** | **70** (~2 месяца один разработчик) |

---

## Риски и их митигация

| Риск | Вероятность | Митигация |
|------|-------------|-----------|
| Изменения API DeepSeek | MEDIUM | Абстракция провайдера + fallback |
| Сложность рефакторинга CLI | HIGH | Пошагово с CI проверками |
| Производительность tiktoken | LOW | Кэшировать энкодер |
| Поломка обратной совместимости | MEDIUM | Feature flags + миграции |

---

## Заключение

После выполнения этого плана PoopSeek станет:
- 🔒 **Безопасным** — защита от инъекций и rate limiting
- 🧪 **Тестируемым** — 70% покрытия кода
- ⚡ **Быстрым** — оптимизация контекста и кэширование
- 🚀 **Расширяемым** — плагины и MCP изоляция

**Начать с Фазы 0 (критические исправления) — выполнить до следующего релиза.**

---

_План составлен на основе код-ревью от 2026-04-28._
_Автор: Poopseek AI Agent_
