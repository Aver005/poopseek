# PoopSeek — Project Guide for Claude

## Stack
- **Runtime**: Bun (not Node.js — use `Bun.spawn`, `Bun.file`, etc.)
- **Language**: TypeScript 5+ strict mode
- **AI backend**: DeepSeek Chat API (custom client in `src/deepseek-client/`)
- **Terminal UI**: terminal-kit
- **Build**: `bun run build` → `build/index.js`; `bun run start` → dev watch

## Path aliases
- `@/*` → `src/`
- `$/*` → `assets/`
- `#/*` → `src/deepseek-client/`

## Architecture

### Tools
Static registry in `src/tools/index.ts` (`toolsRegistry: Record<string, ToolHandler>`).
Each tool: `src/tools/defs/<name>.ts` — exports `name: string` and `handler: ToolHandler`.
`ToolHandler = (args, context: ToolContext) => Promise<ToolExecutionResult>`
Dispatch: `ToolExecutor.execute()` in `src/agent/tool-executor.ts`.

### Commands (slash-commands)
Defined in `src/commands/defs/<name>.ts`, registered in `src/commands/index.ts`.

### Skills
Dynamic markdown files with YAML frontmatter. Discovered by `SkillManager` from 49+ dirs.
Injected into system prompt when active.

### Agent loop
`src/agent/loop.ts` — max 256 steps/turn. Calls DeepSeek → parses tool calls → runs ToolExecutor → repeats.

### Config locations
- Token: `%APPDATA%/poopseek/config.json`
- Sessions: `~/.claude/sessions/`
- Prompts: `assets/prompts/base.prompt.md`, `compact.prompt.md`

## MCP Integration (DONE)

Full MCP support via `@modelcontextprotocol/sdk@1.29.0`. STDIO + Streamable HTTP.

### Files
```
src/mcp/types.ts     — config & state types
src/mcp/config.ts    — auto-discover from Claude Desktop, VS Code, Cursor, mcp.config.json
src/mcp/manager.ts   — MCPManager: lifecycle, tools/resources/prompts, tool bridge
src/mcp/index.ts     — re-exports
src/commands/defs/mcp.ts  — /mcp command (list/tools/resources/prompts/connect/etc.)
```

### Config file: `mcp.config.json` in workspace root
```json
{
  "servers": {
    "my-server": { "transport": "stdio", "command": "npx", "args": [...] },
    "remote": { "transport": "http", "url": "https://...", "headers": {} }
  },
  "autoDiscover": true,
  "extraPaths": ["~/other-mcp.json"],
  "disabled": ["server-to-skip"]
}
```

### Auto-discovery priority (first-found wins per server name)
1. `./mcp.config.json` (workspace) + extra paths
2. `%APPDATA%\poopseek\mcp.config.json` (global)
3. `%APPDATA%\Claude\claude_desktop_config.json`
4. `.vscode/mcp.json`, `%APPDATA%\Code\User\settings.json` (mcp.servers)
5. `~/.cursor/mcp.json`, `%APPDATA%\Cursor\User\settings.json`
6. `%APPDATA%\Trae\User\mcp.json`

### Tool naming: `mcp__serverName__toolName`
### Primitives: Tools (callable), Resources (auto-injected as context), Prompts (as Skills)

## Code conventions
- No comments unless WHY is non-obvious
- No error handling for impossible cases
- Prefer editing existing files over creating new ones
- Bun APIs over Node.js equivalents where possible
