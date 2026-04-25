import fs from "node:fs";
import path from "node:path";
import os from "node:os";

export interface SkillMeta
{
    name: string;
    description: string;
    path: string;
    body: string;
    internal: boolean;
}

// All project-local skill directories (relative to workspaceRoot) from the Agent Skills spec
const PROJECT_SKILL_DIRS = [
    "skills",
    "skills/.curated",
    "skills/.experimental",
    "skills/.system",
    ".agents/skills",
    ".augment/skills",
    ".claude/skills",
    ".codebuddy/skills",
    ".commandcode/skills",
    ".continue/skills",
    ".cortex/skills",
    ".crush/skills",
    ".factory/skills",
    ".goose/skills",
    ".junie/skills",
    ".iflow/skills",
    ".kilocode/skills",
    ".kiro/skills",
    ".kode/skills",
    ".mcpjam/skills",
    ".vibe/skills",
    ".mux/skills",
    ".openhands/skills",
    ".pi/skills",
    ".qoder/skills",
    ".qwen/skills",
    ".roo/skills",
    ".trae/skills",
    ".windsurf/skills",
    ".zencoder/skills",
    ".neovate/skills",
    ".pochi/skills",
    ".adal/skills",
];

// All global skill directories (relative to os.homedir()) from the Agent Skills spec
const GLOBAL_SKILL_DIRS = [
    ".config/agents/skills",
    ".gemini/antigravity/skills",
    ".augment/skills",
    ".claude/skills",
    ".openclaw/skills",
    ".agents/skills",
    ".codebuddy/skills",
    ".codex/skills",
    ".commandcode/skills",
    ".continue/skills",
    ".snowflake/cortex/skills",
    ".config/crush/skills",
    ".cursor/skills",
    ".deepagents/agent/skills",
    ".factory/skills",
    ".firebender/skills",
    ".gemini/skills",
    ".copilot/skills",
    ".config/goose/skills",
    ".junie/skills",
    ".iflow/skills",
    ".kilocode/skills",
    ".kiro/skills",
    ".kode/skills",
    ".mcpjam/skills",
    ".vibe/skills",
    ".mux/skills",
    ".config/opencode/skills",
    ".openhands/skills",
    ".pi/agent/skills",
    ".qoder/skills",
    ".qwen/skills",
    ".roo/skills",
    ".trae/skills",
    ".trae-cn/skills",
    ".codeium/windsurf/skills",
    ".zencoder/skills",
    ".neovate/skills",
    ".pochi/skills",
    ".adal/skills",
];

function parseSkillFrontmatter(raw: string): { meta: Record<string, string | boolean>; body: string } | null
{
    const normalized = raw.replace(/\r\n/g, "\n");
    if (!normalized.startsWith("---\n")) return null;

    const closingIndex = normalized.indexOf("\n---\n", 4);
    if (closingIndex === -1) return null;

    const frontmatter = normalized.slice(4, closingIndex);
    const body = normalized.slice(closingIndex + 5).trim();

    const meta: Record<string, string | boolean> = {};
    let insideMetadata = false;

    for (const line of frontmatter.split("\n"))
    {
        if (line.startsWith("metadata:"))
        {
            insideMetadata = true;
            continue;
        }

        if (insideMetadata)
        {
            if (line.startsWith("  "))
            {
                const inner = line.trimStart();
                const colonIdx = inner.indexOf(":");
                if (colonIdx !== -1)
                {
                    const key = `metadata.${inner.slice(0, colonIdx).trim()}`;
                    const value = inner.slice(colonIdx + 1).trim();
                    meta[key] = value === "true" ? true : value === "false" ? false : value;
                }
                continue;
            }
            insideMetadata = false;
        }

        const colonIdx = line.indexOf(":");
        if (colonIdx !== -1)
        {
            const key = line.slice(0, colonIdx).trim();
            const value = line.slice(colonIdx + 1).trim();
            meta[key] = value;
        }
    }

    return { meta, body };
}

function tryReadSkillFile(filePath: string): SkillMeta | null
{
    if (!fs.existsSync(filePath)) return null;

    let raw: string;
    try
    {
        raw = fs.readFileSync(filePath, "utf8");
    }
    catch
    {
        return null;
    }

    const parsed = parseSkillFrontmatter(raw);
    if (!parsed) return null;

    const { meta, body } = parsed;
    const name = typeof meta["name"] === "string" ? meta["name"].trim() : "";
    const description = typeof meta["description"] === "string" ? meta["description"].trim() : "";
    if (!name) return null;

    return {
        name,
        description,
        path: filePath,
        body,
        internal: meta["metadata.internal"] === true,
    };
}

function collectSkillFiles(dir: string): string[]
{
    if (!fs.existsSync(dir)) return [];
    let entries: fs.Dirent[];
    try
    {
        entries = fs.readdirSync(dir, { withFileTypes: true });
    }
    catch
    {
        return [];
    }

    const results: string[] = [];

    const direct = path.join(dir, "SKILL.md");
    if (fs.existsSync(direct)) results.push(direct);

    for (const entry of entries)
    {
        if (entry.isDirectory())
        {
            const candidate = path.join(dir, entry.name, "SKILL.md");
            if (fs.existsSync(candidate)) results.push(candidate);
        }
    }

    return results;
}

function buildDefaultSearchRoots(workspaceRoot: string): string[]
{
    const homeDir = os.homedir();
    const roots: string[] = [];

    for (const rel of PROJECT_SKILL_DIRS)
    {
        roots.push(path.join(workspaceRoot, rel));
    }

    for (const rel of GLOBAL_SKILL_DIRS)
    {
        roots.push(path.join(homeDir, rel));
    }

    return roots;
}

export function discoverSkills(
    workspaceRoot: string,
    extraFolders: string[] = [],
    includeInternal = false,
): SkillMeta[]
{
    const seen = new Set<string>();
    const skills: SkillMeta[] = [];

    const addSkill = (filePath: string): void =>
    {
        const skill = tryReadSkillFile(filePath);
        if (!skill) return;
        if (!includeInternal && skill.internal) return;
        if (seen.has(skill.name)) return;
        seen.add(skill.name);
        skills.push(skill);
    };

    // Root SKILL.md of the workspace itself
    addSkill(path.join(workspaceRoot, "SKILL.md"));

    const allRoots = [...buildDefaultSearchRoots(workspaceRoot), ...extraFolders];

    for (const root of allRoots)
    {
        for (const filePath of collectSkillFiles(root))
        {
            addSkill(filePath);
        }
    }

    return skills;
}

export class SkillManager
{
    private skills: SkillMeta[] = [];
    private active = new Set<string>();
    private extraFolders: string[] = [];
    private workspaceRoot = "";

    setExtraFolders(folders: string[]): void
    {
        this.extraFolders = folders;
    }

    getExtraFolders(): string[]
    {
        return [...this.extraFolders];
    }

    addExtraFolder(folder: string): void
    {
        const normalized = path.resolve(folder);
        if (!this.extraFolders.includes(normalized))
        {
            this.extraFolders.push(normalized);
        }
    }

    resetExtraFolders(): void
    {
        this.extraFolders = [];
    }

    discover(workspaceRoot: string): void
    {
        this.workspaceRoot = workspaceRoot;
        this.skills = discoverSkills(workspaceRoot, this.extraFolders);
    }

    rediscover(): void
    {
        this.skills = discoverSkills(this.workspaceRoot, this.extraFolders);
    }

    getSkills(): SkillMeta[]
    {
        return this.skills;
    }

    activate(name: string): boolean
    {
        const skill = this.skills.find((s) => s.name === name);
        if (!skill) return false;
        this.active.add(name);
        return true;
    }

    deactivate(name: string): boolean
    {
        return this.active.delete(name);
    }

    clearActive(): void
    {
        this.active.clear();
    }

    isActive(name: string): boolean
    {
        return this.active.has(name);
    }

    getActiveNames(): string[]
    {
        return Array.from(this.active);
    }

    getActiveContent(): string
    {
        const parts: string[] = [];
        for (const name of this.active)
        {
            const skill = this.skills.find((s) => s.name === name);
            if (!skill) continue;
            parts.push(`## Skill: ${skill.name}\n${skill.body}`);
        }
        return parts.join("\n\n");
    }
}
