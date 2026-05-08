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

## Figma editing pipeline (Handyman)

Two distinct flows:
- **Create flow** (`runBuilderOneShot`): LLM produces fresh JSX → `compileJsx` → ops to plugin. JSX→Tailwind compile-time concerns live in `src/figma/engine/jsx/{classname,jsx-spec,jsx-compiler,jsx-validator}.ts`.
- **Edit flow** (`runHandymanEdit`): existing snapshot loaded into a `JsxBuffer`, LLM emits a partial DIFF, applier merges into the buffer, the **whole buffer is recompiled** and dispatched. See [memory: project_figma_edit_pipeline.md] for the full chain.

### Edit-flow files
```
src/figma/infrastructure/http/handlers/chat.ts   — orchestrates loadNodesIntoBuffer → runHandymanEdit → applyDiff → compile → dispatch + SSE "debug-jsx"
src/figma/application/pipeline/handyman.ts        — LLM call + applyDiff result handling (returns ok:false on dup-keys)
src/figma/engine/jsx/jsx-diff-applier.ts          — applyDiff: partial-merge, `old` skips subtree, dup-key validation, auto-move
src/figma/engine/jsx/jsx-buffer.ts                — JsxBuffer: in-memory tree, edit({parentId}) re-parents, toJsx() serializes
src/figma/engine/handyman/handyman-tools.ts       — loadNodesIntoBuffer + tool-call edit handlers (figma.get/find/patch/insert/move/...)
assets/prompts/figma/handyman.prompt.md           — single source of truth for the DIFF format the model must produce
```

### `old` diff semantics (current contract — was reworked from the original "reconcile-and-delete" model)
- `old` on a node = **subtree fully preserved**. Both props and children are skipped. Anything written inside `<Foo old>…</Foo>` is ignored.
- Node WITHOUT `old` = partial merge: listed props overwrite/add, omitted props kept; listed children processed recursively, **omitted children kept** (no implicit deletion). Deletions go through `## REMOVED` exclusively.
- Auto-move: existing key referenced under a different parent → moved.
- Duplicate keys in DIFF are **rejected** before applying (entire diff bounces back as error).

### Figma plugin (`plugins/figma/src/`) — defensive invariants
The plugin executes `FigmaOp[]` from the server. Several non-obvious patterns exist *because* of past cascade failures — leave them in:
- `handlers.ts`: `nodeMap.clear()` at every EXECUTE_OPS batch start. Stale entries between turns aliased multiple keys onto orphan nodes.
- `create_*` handlers skip find-by-name fallback when `op.id` is provided. Generic `name="Text"` was matching siblings.
- `helpers.ts::ensureCorrectParent` re-parents a REUSE-by-id node if its actual figma parent ≠ `op.frameId`.
- `helpers.ts::applyLayoutSizing` and `ops/set-auto-layout.ts` **never throw** on bad parent — log `❌ skipping FILL` and fall back to FIXED. Throwing cascaded into many failed ops in batch.
- `ops/clear-frame-children.ts` does two-pass orphan cleanup: top-level non-target FRAMES, then `currentPage.findAll` for any of the 5 primitives outside the target subtree.
- Debug logging via `plugins/figma/src/debug.ts`: `dlog`/`derr` auto-prefixed with `[ops/N/M]` via `setCurrentOpTag`. Toggle with `DEBUG = true|false`. When debugging, ask user for trace around the first `❌` — root cause is almost always one `[resolveParent] ❌` or stale REUSE-by-id.

## Code conventions
- No comments unless WHY is non-obvious
- No error handling for impossible cases
- Prefer editing existing files over creating new ones
- Bun APIs over Node.js equivalents where possible
