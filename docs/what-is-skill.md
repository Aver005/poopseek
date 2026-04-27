# Навыки в PoopSeek

## Обзор

PoopSeek поддерживает Agent Skills specification — систему переиспользуемых наборов инструкций, расширяющих возможности агента. Навыки определяются в файлах `SKILL.md` с YAML frontmatter.

Модуль: `src/skills/`.

## Структура навыка

Файл `SKILL.md`:

```markdown
---
name: my-skill
description: Что делает этот навык и когда применять
---

# My Skill

Инструкции для агента при активации навыка.
```

### Обязательные поля
- `name` — уникальный идентификатор (lowercase, дефисы разрешены)
- `description` — краткое описание

### Опциональные поля
- `metadata.internal: true` — скрыть навык из обычного обнаружения

## Где PoopSeek ищет навыки

### Проектные директории (относительно рабочей папки)
`skills/`, `skills/.curated/`, `skills/.experimental/`, `skills/.system/`, `.agents/skills/`, `.augment/skills/`, `.claude/skills/`, `.codebuddy/skills/`, `.commandcode/skills/`, `.continue/skills/`, `.cortex/skills/`, `.crush/skills/`, `.factory/skills/`, `.goose/skills/`, `.junie/skills/`, `.iflow/skills/`, `.kilocode/skills/`, `.kiro/skills/`, `.kode/skills/`, `.mcpjam/skills/`, `.vibe/skills/`, `.mux/skills/`, `.openhands/skills/`, `.pi/skills/`, `.qoder/skills/`, `.qwen/skills/`, `.roo/skills/`, `.trae/skills/`, `.windsurf/skills/`, `.zencoder/skills/`, `.neovate/skills/`, `.pochi/skills/`, `.adal/skills/`

### Глобальные директории (относительно домашней папки)
`.config/agents/skills/`, `.gemini/antigravity/skills/`, `.augment/skills/`, `.claude/skills/`, `.openclaw/skills/`, `.agents/skills/`, `.codebuddy/skills/`, `.codex/skills/`, `.commandcode/skills/`, `.continue/skills/`, `.snowflake/cortex/skills/`, `.config/crush/skills/`, `.cursor/skills/`, `.deepagents/agent/skills/`, `.factory/skills/`, `.firebender/skills/`, `.gemini/skills/`, `.copilot/skills/`, `.config/goose/skills/`, `.junie/skills/`, `.iflow/skills/`, `.kilocode/skills/`, `.kiro/skills/`, `.kode/skills/`, `.mcpjam/skills/`, `.vibe/skills/`, `.mux/skills/`, `.config/opencode/skills/`, `.openhands/skills/`, `.pi/agent/skills/`, `.qoder/skills/`, `.qwen/skills/`, `.roo/skills/`, `.trae/skills/`, `.trae-cn/skills/`, `.codeium/windsurf/skills/`, `.zencoder/skills/`, `.neovate/skills/`, `.pochi/skills/`, `.adal/skills/`

### Дополнительные папки
Пользователь может добавить произвольные папки через `/skills-folder add <путь>`.

### Корневой SKILL.md
Файл `SKILL.md` в корне рабочей папки также проверяется.

## SkillManager API

```typescript
export class SkillManager {
    // Обнаружение навыков
    discover(workspaceRoot: string): void
    rediscover(): void

    // Получение всех обнаруженных навыков
    getSkills(): SkillMeta[]

    // Активация/деактивация
    activate(name: string): boolean
    activateAll(): void
    deactivate(name: string): boolean
    clearActive(): void

    // Проверка статуса
    isActive(name: string): boolean
    getActiveNames(): string[]

    // Получение содержимого активных навыков (для системного промпта)
    getActiveContent(): string

    // Управление дополнительными папками
    setExtraFolders(folders: string[]): void
    addExtraFolder(folder: string): void
    removeExtraFolder(folder: string): void
    resetExtraFolders(): void
    getExtraFolders(): string[]

    // Внешние навыки (например, из MCP-промптов)
    setExternalSkills(skills: SkillMeta[]): void
}
```

## Тип SkillMeta

```typescript
export interface SkillMeta {
    name: string;
    description: string;
    path: string;        // путь к файлу SKILL.md
    body: string;        // содержимое после frontmatter
    internal: boolean;   // скрытый навык (metadata.internal: true)
}
```

## Управление через CLI

- `/skills` — интерактивный список навыков (с активацией/деактивацией)
- `/skills list [page]` — постраничный список
- `/skills all` — активировать все
- `/skills reset` — деактивировать все
- `/skills use <name>` — активировать конкретный
- `/skills off <name>` — деактивировать конкретный
- `/skills clear` — деактивировать все
- `/skills-folder list` — показать дополнительные папки
- `/skills-folder add <путь>` — добавить папку
- `/skills-folder remove` — удалить папку (интерактивно)
- `/skills-folder reset` — сбросить все дополнительные папки
- `/maestro` — алиас `/skills all`
- `/noob` — алиас `/skills reset`

## Интеграция с контекстом

При активации навыка его `body` добавляется в системный промпт через `ContextManager.setSkillsContent()`. Список доступных навыков передаётся через `setAvailableSkillsHint()`.
