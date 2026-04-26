# Changelog

All notable changes to PoopSeek are documented here.

---

## [1.1.0] — Unreleased

### Agent Engine

- **Token-aware context refresh** — `ContextManager` now tracks approximate token count per session and automatically injects a compact refresh snapshot every ~64k tokens, preventing context degradation on long conversations. New `PreparedTurnMessage` type exposes `approxTokens`, `includedBootstrap`, and `includedRefresh` flags.
- **Session reset** — added `markSessionReset()` to `ContextManager`; resets the token counter and schedules a bootstrap message on the next turn.
- **Batched tool calls** — the agent loop now parses and dispatches multiple tool calls in a single model response step, significantly reducing round-trips for multi-step operations. `maxStepsPerTurn` raised from 10 → 256.
- **`maxToolsPerStep` limit** — new option on `AgentLoopOptions` caps parallel tool dispatch per step (default 10; refactor mode uses 20) to prevent runaway tool fan-out.
- **YAML tool-call format** — `parseMessage()` in `tool-call-parser.ts` now accepts both JSON and YAML-encoded tool calls from the model, improving robustness when the model produces non-standard output.
- **Reasoning commentary** — the loop filters and surfaces DeepSeek reasoning tokens as inline commentary before tool results, making step-by-step thinking visible in the terminal.
- **Retry on `try-again`** — `executeWithRetry()` added to the loop; tools that return a `try-again` flow action are automatically retried once before propagating failure.

### Sessions & History

- **Local session persistence** — new `SessionStore` (`src/cli/session-store.ts`) saves and loads conversations to `~/.claude/sessions/` as JSON. Each session gets a UUID, timestamp, and dialogue snapshot.
- **`/sessions` command** — lists saved sessions with message count and date; supports `new`, `delete <id>`, and `list` sub-commands.
- **Session loading with confirmation** — `/load` command refactored into a confirmation-dialog flow: shows session metadata, asks for confirmation, then restores the full dialogue into `ContextManager`. The DeepSeek client gains `loadHistory()` to seed a `ChatSession` from stored messages.
- **History loading in DeepSeek client** — `DeepseekClient.loadHistory()` and `ChatSession.seedHistory()` added to support pre-populating a session from persisted message arrays.

### Memory Tools

- **`memory.save`** — persists key-value entries to a project-local memory store (`.poopseek/memory/` by default). Supports optional `namespace` and `ttl`.
- **`memory.read`** — retrieves a stored entry by key; returns `null` if missing or expired.
- **`memory.list`** — lists all live entries in a namespace with their keys and metadata.
- Base prompt updated to document memory tools and their usage patterns.

### User Interaction Tools

- **`user.ask`** — pauses execution and prompts the user for a free-text answer; result returned to the tool caller.
- **`user.confirm`** — prompts the user for a yes/no confirmation; returns `true`/`false`.
- **`user.choice`** — displays a labelled option list and returns the selected value.
- All three tools are wired through the existing `AskUserFn` callback in `ToolContext`, so they work transparently in both main-chat and sidechat flows.
- `ToolExecutionResult` extended with a `requiresInput` flag used by the tool executor to pause the generation indicator during prompts.

### Skills System

- **`SkillManager`** — new module (`src/skills/index.ts`) that discovers Markdown skill files from 49+ IDE-specific directories (`.claude/skills`, `.cursor/skills`, `.trae/skills`, etc.) at both project and global (`$HOME`) scope. Skills carry YAML frontmatter (`name`, `description`) and are injected into the system prompt when active.
- **`/skills`** — interactive command to list, activate, deactivate, and search skills. Supports tab-completion on skill names. Sub-commands: `list`, `add <name>`, `remove <name>`, `reset`, `all`, `active`.
- **`/skills-folder`** — registers additional search paths at runtime; persisted to `SkillFoldersStore`.
- **`/maestro`** — alias for `/skills all`; activates every discovered skill.
- **`/noob`** — alias for `/skills reset`; deactivates all skills.
- **`skill.read` tool** — lets the agent read the full body of any skill by name; result injected as tool output so the model can reference skill contents mid-turn.
- **Command history** — terminal input now maintains a per-session history buffer; Up/Down arrows navigate previous commands.

### MCP Integration

- **Full Model Context Protocol support** via `@modelcontextprotocol/sdk@1.29.0` — both STDIO and Streamable HTTP transports.
- **`MCPManager`** (`src/mcp/manager.ts`) — manages server lifecycle (connect/disconnect/reconnect), exposes tools, resources, and prompts via unified accessors.
- **Auto-discovery** — `MCPConfigLoader` (`src/mcp/config.ts`) resolves servers from (in priority order): `./mcp.config.json`, `%APPDATA%/poopseek/mcp.config.json`, Claude Desktop, VS Code, Cursor, and Trae IDE config files.
- **Tool bridging** — MCP tools are registered in the agent's tool registry under the `mcp__<server>__<tool>` naming scheme and invoked transparently through `ToolExecutor`.
- **Resource injection** — MCP resources are fetched at turn start and appended to the system prompt as context.
- **Prompt-as-skill** — MCP prompts are surfaced as skills and can be activated via `/skills`.
- **`/mcp` command** — sub-commands: `list`, `tools [server]`, `resources [server]`, `prompts [server]`, `connect <server>`, `disconnect <server>`, `reload`, `status`.
- **Trae IDE MCP** — auto-discovery extended to `%APPDATA%/Trae/User/mcp.json`.

### New Commands

- **`/think`** — toggles DeepSeek reasoning mode (`thinking_enabled`) on/off for the current session.
- **`/web`** — toggles web search (`search_enabled`) on/off for the current session.
- **`/logout`** — revokes the stored API token, then prompts for a new one immediately (relogin flow). Token validation added to `DeepseekClient`.
- **`/review`** — AI-powered code review command with configurable scope:
  - `all` — `git diff HEAD` (staged + unstaged)
  - `staged` — `git diff --staged`
  - `branch [base]` — diff against a base branch
  - `file <path>` — single-file review
  - `commit <ref>` — review a specific commit
  - Runs a dedicated `AgentLoop` with its own system prompt (`assets/prompts/review.prompt.md`).
- **`/refactor`** — AI-driven refactor command with four intensity levels:
  - `easy` — 24 max steps, 1 strategy, quick win
  - `medium` — 56 max steps, 2–3 strategies with commits between them
  - `hard` — 120 max steps, 4–6 strategies with full validation
  - `ultra` — 240 max steps, all applicable strategies, codebase transformation
  - Each level runs an isolated `AgentLoop` with `assets/prompts/refactor.prompt.md` and `maxToolsPerStep: 20`.

### New Tools

- **`file.find`** — recursive file search with glob pattern support; replaces ad-hoc shell `find` calls in tool prompts. Cross-platform path normalization added.
- **`todo.write`** — writes a persistent per-workspace todo list to `.poopseek/todo.json` (`TodoStore`). Supports create, update, complete, and delete operations.
- **`todo.read`** — reads the current todo list; returns structured entries with `id`, `title`, `status`, and `createdAt`.

### CLI & Terminal

- **`$OS` variable** — new variable resolver that exposes `windows`, `linux`, or `macos`; used in prompts to gate platform-specific tool suggestions.
- **Auth/input/sidechat modules** — `run-cli.ts` refactored: authentication flow extracted to `src/cli/auth-flow.ts`, input queuing to `src/cli/input-queue.ts`, sidechat handling to `src/cli/sidechat.ts`.
- **Atomic file writes** — shared `writeTextFile()` utility (`src/tools/utils/write-text-file.ts`) used by `file.write`, `file.edit`, and `git.edit` to ensure crash-safe output via temp-file + rename.

### Prompts & Docs

- Base prompt updated with software engineering principles (minimal changes, no premature abstractions, no impossible-case error handling).
- PowerShell removed from the base tools list; replaced by cross-platform alternatives.
- `git` tool description updated for cross-platform compatibility.
- `assets/prompts/review.prompt.md` and `assets/prompts/refactor.prompt.md` added (135 and 325 lines respectively).
- `docs/MCP-architecture.md` — comprehensive MCP architecture reference (464 lines).
- `docs/what-is-skill.md` — skill system specification and discovery algorithm (195 lines).
- `CLAUDE.md` updated with MCP configuration reference and path alias table.

---

## [1.0.0] — 2025 (initial release)

See [docs/RELEASE-v1.0.0.md](docs/RELEASE-v1.0.0.md) for the initial release notes.

Core features shipped in 1.0.0: DeepSeek Chat client, agent loop with tool execution, terminal UI with markdown rendering, file autocompletion, multiline input, git tools, `/compact`, `/model`, `/switch`, variable substitution, sidechat, session history, colored output, and the initial tool registry.
