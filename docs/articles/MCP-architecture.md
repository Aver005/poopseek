# MCP-интеграция PoopSeek

## Обзор

PoopSeek поддерживает Model Context Protocol (MCP) для подключения к внешним серверам, предоставляющим дополнительные инструменты, ресурсы и промпты.

Модуль: `src/mcp/`.

## Компоненты

### MCPManager (`manager.ts`)

Основной класс для управления MCP-подключениями.

```typescript
export class MCPManager {
    // Инициализация: загрузка конфигов, подключение к серверам
    async initialize(): Promise<void>

    // Остановка всех подключений
    async shutdown(): Promise<void>

    // Получение статусов всех серверов
    getServerStatuses(): MCPServerInfo[]

    // Получение списка MCP-инструментов для регистрации
    getToolRegistrations(): Array<{ name: string; handler: ToolHandler }>

    // Получение списка MCP-ресурсов
    getResourceList(): MCPResourceInfo[]

    // Получение списка MCP-промптов
    getPromptList(): MCPPromptInfo[]

    // Чтение ресурса
    async readResource(serverName: string, uri: string): Promise<string>

    // Получение промпта
    async getPrompt(serverName: string, promptName: string): Promise<string>

    // Подключение к серверу
    async connect(serverName: string): Promise<void>

    // Отключение от сервера
    async disconnect(serverName: string): Promise<void>

    // Включение/отключение сервера
    async enable(serverName: string): Promise<void>
    async disable(serverName: string): Promise<void>

    // Перезагрузка конфигурации
    async reload(): Promise<void>

    // Навыки из MCP-промптов
    getPromptSkills(): SkillMeta[]
}
```

### Конфигурация (`config.ts`)

Загрузка конфигурации MCP-серверов из нескольких источников:

1. **Проектный конфиг** — `mcp.config.json` в корне рабочей папки
2. **Глобальный конфиг PoopSeek** — `~/.poopseek/mcp.json`
3. **Claude Desktop** — `%APPDATA%/Claude/claude_desktop_config.json` (Windows) или `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS)
4. **VS Code** — `.vscode/mcp.json` (проектный) и `~/.vscode/mcp.json` (глобальный)
5. **Cursor** — `~/.cursor/mcp.json`
6. **Trae** — `~/.trae/mcp.json`

### Типы (`types.ts`)

```typescript
type MCPServerConfig = MCPStdioServerConfig | MCPHttpServerConfig;

type MCPStdioServerConfig = {
    transport: "stdio";
    command: string;
    args?: string[];
    env?: Record<string, string>;
};

type MCPHttpServerConfig = {
    transport: "http";
    url: string;
    headers?: Record<string, string>;
};

type MCPServerStatus = "pending" | "connecting" | "connected" | "error" | "disabled";
```

## Именование инструментов

MCP-инструменты получают префиксованное имя для уникальности:

```typescript
export function encodeMCPToolName(serverName: string, toolName: string): string {
    return `mcp__${sanitizeNamePart(serverName)}__${toolName}`;
}
```

Пример: инструмент `read_file` с сервера `filesystem` → `mcp__filesystem__read_file`.

## Транспорты

- **STDIO** — запуск локального процесса, общение через stdin/stdout
- **Streamable HTTP** — HTTP POST с Server-Sent Events для стриминга

## Ограничения

- Размер авто-читаемых ресурсов: максимум 32 KB (`MAX_AUTO_RESOURCE_SIZE`)
- Таймаут подключения: 8 секунд (`CONNECT_TIMEOUT_MS`)
- Статус серверов кешируется на 5 минут (`MCP_STATUS_CACHE_TTL_MS`)

## Управление через CLI

Команда `/mcp` с подкомандами: `list`, `tools`, `resources`, `prompts`, `connect`, `disconnect`, `enable`, `disable`, `reload`, `info`, `read`, `prompt`.

Подробнее: `docs/commands.md` → `/mcp`.
