import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Tool, Resource, Prompt } from "@modelcontextprotocol/sdk/types.js";
import type { MCPServerConfig, MCPServerInfo, MCPServerStatus, MCPToolInfo, MCPResourceInfo, MCPPromptInfo } from "./types";
import type { ToolHandler } from "@/tools/types";
import type { SkillMeta } from "@/skills";

const CLIENT_INFO = { name: "poopseek", version: "1.0.0" };
const MAX_AUTO_RESOURCE_SIZE = 32_768;
const CONNECT_TIMEOUT_MS = 8_000;
const MCP_STATUS_CACHE_TTL_MS = 5 * 60 * 1000;
const MCP_STATUS_CACHE_FILE = "mcp-status-cache.json";

type CachedStatus = {
    checkedAt: number;
    signature: string;
    status: "connected" | "error";
    error?: string;
};

type CachedStatusFile = {
    version: 1;
    entries: Record<string, CachedStatus>;
};

function sanitizeNamePart(name: string): string
{
    return name.replace(/[^a-zA-Z0-9]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
}

export function encodeMCPToolName(serverName: string, toolName: string): string
{
    return `mcp__${sanitizeNamePart(serverName)}__${toolName}`;
}

function toolResultToString(content: unknown[]): string
{
    const parts: string[] = [];
    for (const item of content)
    {
        if (!item || typeof item !== "object") continue;
        const c = item as Record<string, unknown>;
        if (c["type"] === "text" && typeof c["text"] === "string")
        {
            parts.push(c["text"]);
        }
        else if (c["type"] === "image")
        {
            parts.push(`[Image: ${c["mimeType"] ?? "unknown"}]`);
        }
        else if (c["type"] === "resource")
        {
            const res = c["resource"] as Record<string, unknown> | undefined;
            if (res?.["text"]) parts.push(String(res["text"]));
            else if (res?.["uri"]) parts.push(`[Resource: ${res["uri"]}]`);
        }
    }
    return parts.join("\n");
}

interface ServerEntry
{
    name: string;
    source: string;
    config: MCPServerConfig;
    client: Client | null;
    status: MCPServerStatus;
    error?: string;
    tools: Tool[];
    resources: Resource[];
    prompts: Prompt[];
}

export class MCPManager
{
    private servers = new Map<string, ServerEntry>();
    private toolNameMap = new Map<string, { serverName: string; toolName: string }>();
    private statusCache = new Map<string, CachedStatus>();
    private statusCacheLoaded = false;
    private statusCacheDirty = false;

    private getStatusCachePath(): string
    {
        const appData = process.platform === "win32"
            ? (process.env["APPDATA"] ?? path.join(os.homedir(), "AppData", "Roaming"))
            : path.join(os.homedir(), ".config");
        const configDir = process.platform === "win32"
            ? path.join(appData, "poopseek")
            : path.join(os.homedir(), ".config", "poopseek");
        return path.join(configDir, MCP_STATUS_CACHE_FILE);
    }

    private getConfigSignature(config: MCPServerConfig): string
    {
        return JSON.stringify(config);
    }

    private async ensureStatusCacheLoaded(): Promise<void>
    {
        if (this.statusCacheLoaded) return;
        this.statusCacheLoaded = true;
        try
        {
            const filePath = this.getStatusCachePath();
            const raw = await fs.readFile(filePath, "utf8");
            const parsed = JSON.parse(raw) as CachedStatusFile;
            const entries = parsed.entries ?? {};
            for (const [name, value] of Object.entries(entries))
            {
                if (
                    typeof value.checkedAt === "number" &&
                    typeof value.signature === "string" &&
                    (value.status === "connected" || value.status === "error")
                )
                {
                    this.statusCache.set(name, value);
                }
            }
        }
        catch {}
    }

    private async flushStatusCache(): Promise<void>
    {
        if (!this.statusCacheDirty) return;
        this.statusCacheDirty = false;
        const filePath = this.getStatusCachePath();
        const payload: CachedStatusFile = {
            version: 1,
            entries: Object.fromEntries(this.statusCache.entries()),
        };
        await fs.mkdir(path.dirname(filePath), { recursive: true }).catch(() => undefined);
        await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8").catch(() => undefined);
    }

    private getFreshCachedStatus(entry: ServerEntry): CachedStatus | null
    {
        const cached = this.statusCache.get(entry.name);
        if (!cached) return null;
        if (cached.signature !== this.getConfigSignature(entry.config)) return null;
        if (Date.now() - cached.checkedAt > MCP_STATUS_CACHE_TTL_MS) return null;
        return cached;
    }

    private applyCachedError(entry: ServerEntry): boolean
    {
        const cached = this.getFreshCachedStatus(entry);
        if (!cached || cached.status !== "error") return false;
        entry.status = "error";
        entry.error = cached.error ?? "cached MCP connection error";
        entry.client = null;
        entry.tools = [];
        entry.resources = [];
        entry.prompts = [];
        return true;
    }

    private saveEntryStatusToCache(entry: ServerEntry): void
    {
        if (entry.status !== "connected" && entry.status !== "error") return;
        this.statusCache.set(entry.name, {
            checkedAt: Date.now(),
            signature: this.getConfigSignature(entry.config),
            status: entry.status,
            error: entry.error,
        });
        this.statusCacheDirty = true;
    }

    private withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T>
    {
        return new Promise<T>((resolve, reject) =>
        {
            const timer = setTimeout(() => reject(new Error(`${label} timeout (${timeoutMs}ms)`)), timeoutMs);
            promise
                .then((value) =>
                {
                    clearTimeout(timer);
                    resolve(value);
                })
                .catch((error) =>
                {
                    clearTimeout(timer);
                    reject(error);
                });
        });
    }

    private buildEntry(
        name: string,
        source: string,
        config: MCPServerConfig,
    ): ServerEntry
    {
        return {
            name,
            source,
            config,
            client: null,
            status: "pending",
            tools: [],
            resources: [],
            prompts: [],
        };
    }

    private createTransport(config: MCPServerConfig)
    {
        if (config.transport === "http")
        {
            return new StreamableHTTPClientTransport(new URL(config.url), {
                requestInit: config.headers
                    ? { headers: config.headers }
                    : undefined,
            });
        }

        return new StdioClientTransport({
            command: config.command,
            args: config.args,
            env: config.env
                ? { ...process.env, ...config.env } as Record<string, string>
                : undefined,
            cwd: config.cwd,
            stderr: "pipe",
        });
    }

    private async connectEntry(entry: ServerEntry): Promise<void>
    {
        if (entry.status === "disabled") return;

        try
        {
            entry.status = "connecting";
            entry.error = undefined;

            const client = new Client(CLIENT_INFO, { capabilities: {} });
            const transport = this.createTransport(entry.config);

            await this.withTimeout(
                client.connect(transport),
                CONNECT_TIMEOUT_MS,
                `MCP connect: ${entry.name}`,
            );

            entry.client = client;
            entry.status = "connected";

            await this.withTimeout(
                this.refreshServerData(entry),
                CONNECT_TIMEOUT_MS,
                `MCP metadata: ${entry.name}`,
            );
        }
        catch (err)
        {
            entry.client = null;
            entry.status = "error";
            entry.error = err instanceof Error ? err.message : String(err);
            entry.tools = [];
            entry.resources = [];
            entry.prompts = [];
        }

        this.saveEntryStatusToCache(entry);
        this.rebuildToolNameMap();
    }

    private async refreshServerData(entry: ServerEntry): Promise<void>
    {
        const client = entry.client;
        if (!client) return;

        const capabilities = client.getServerCapabilities();

        const [toolsResult, resourcesResult, promptsResult] = await Promise.allSettled([
            capabilities?.tools ? client.listTools() : Promise.resolve(null),
            capabilities?.resources ? client.listResources() : Promise.resolve(null),
            capabilities?.prompts ? client.listPrompts() : Promise.resolve(null),
        ]);

        entry.tools = toolsResult.status === "fulfilled" && toolsResult.value
            ? toolsResult.value.tools
            : [];
        entry.resources = resourcesResult.status === "fulfilled" && resourcesResult.value
            ? resourcesResult.value.resources
            : [];
        entry.prompts = promptsResult.status === "fulfilled" && promptsResult.value
            ? promptsResult.value.prompts
            : [];

        client.setNotificationHandler(
            { method: "notifications/tools/list_changed" } as never,
            async () =>
            {
                const result = await client.listTools().catch(() => null);
                if (result) entry.tools = result.tools;
                this.rebuildToolNameMap();
            },
        );
    }

    private rebuildToolNameMap(): void
    {
        this.toolNameMap.clear();
        for (const entry of this.servers.values())
        {
            if (entry.status !== "connected") continue;
            for (const tool of entry.tools)
            {
                const fullName = encodeMCPToolName(entry.name, tool.name);
                this.toolNameMap.set(fullName, { serverName: entry.name, toolName: tool.name });
            }
        }
    }

    async initialize(
        configs: Map<string, { config: MCPServerConfig; source: string }>,
        disabled: Set<string>,
    ): Promise<void>
    {
        await this.ensureStatusCacheLoaded();
        this.servers.clear();
        this.toolNameMap.clear();

        for (const [name, { config, source }] of configs)
        {
            const entry = this.buildEntry(name, source, config);
            if (disabled.has(name)) entry.status = "disabled";
            this.servers.set(name, entry);
        }

        const toConnect = Array.from(this.servers.values()).filter(
            (e) => e.status !== "disabled" && !this.applyCachedError(e),
        );

        await Promise.allSettled(toConnect.map((e) => this.connectEntry(e)));
        await this.flushStatusCache();
    }

    async connectServer(name: string): Promise<void>
    {
        const entry = this.servers.get(name);
        if (!entry) throw new Error(`MCP server "${name}" not found`);
        await this.disconnectEntry(entry);
        await this.connectEntry(entry);
        await this.flushStatusCache();
    }

    async disconnectServer(name: string): Promise<void>
    {
        const entry = this.servers.get(name);
        if (!entry) throw new Error(`MCP server "${name}" not found`);
        await this.disconnectEntry(entry);
    }

    private async disconnectEntry(entry: ServerEntry): Promise<void>
    {
        if (entry.client)
        {
            await entry.client.close().catch(() => undefined);
            entry.client = null;
        }
        if (entry.status !== "disabled")
        {
            entry.status = "pending";
        }
        entry.tools = [];
        entry.resources = [];
        entry.prompts = [];
        this.rebuildToolNameMap();
    }

    async enableServer(name: string): Promise<void>
    {
        const entry = this.servers.get(name);
        if (!entry) throw new Error(`MCP server "${name}" not found`);
        if (entry.status !== "disabled") return;
        entry.status = "pending";
        await this.connectEntry(entry);
        await this.flushStatusCache();
    }

    async disableServer(name: string): Promise<void>
    {
        const entry = this.servers.get(name);
        if (!entry) throw new Error(`MCP server "${name}" not found`);
        await this.disconnectEntry(entry);
        entry.status = "disabled";
    }

    async reloadAll(
        configs: Map<string, { config: MCPServerConfig; source: string }>,
        disabled: Set<string>,
    ): Promise<void>
    {
        for (const entry of this.servers.values())
        {
            await this.disconnectEntry(entry).catch(() => undefined);
        }
        await this.initialize(configs, disabled);
    }

    addServer(
        name: string,
        config: MCPServerConfig,
        source = "manual",
    ): void
    {
        if (!this.servers.has(name))
        {
            this.servers.set(name, this.buildEntry(name, source, config));
        }
    }

    getServerStatuses(): MCPServerInfo[]
    {
        return Array.from(this.servers.values()).map((e) => ({
            name: e.name,
            source: e.source,
            config: e.config,
            status: e.status,
            error: e.error,
            toolCount: e.tools.length,
            resourceCount: e.resources.length,
            promptCount: e.prompts.length,
        }));
    }

    getServerEntry(name: string): ServerEntry | undefined
    {
        return this.servers.get(name);
    }

    getAllTools(): MCPToolInfo[]
    {
        const result: MCPToolInfo[] = [];
        for (const entry of this.servers.values())
        {
            if (entry.status !== "connected") continue;
            for (const tool of entry.tools)
            {
                result.push({
                    serverName: entry.name,
                    fullName: encodeMCPToolName(entry.name, tool.name),
                    name: tool.name,
                    title: (tool as { title?: string }).title,
                    description: tool.description,
                    inputSchema: tool.inputSchema as Record<string, unknown>,
                });
            }
        }
        return result;
    }

    getAllResources(): MCPResourceInfo[]
    {
        const result: MCPResourceInfo[] = [];
        for (const entry of this.servers.values())
        {
            if (entry.status !== "connected") continue;
            for (const resource of entry.resources)
            {
                result.push({
                    serverName: entry.name,
                    uri: resource.uri,
                    name: resource.name,
                    description: resource.description,
                    mimeType: resource.mimeType,
                });
            }
        }
        return result;
    }

    getAllPrompts(): MCPPromptInfo[]
    {
        const result: MCPPromptInfo[] = [];
        for (const entry of this.servers.values())
        {
            if (entry.status !== "connected") continue;
            for (const prompt of entry.prompts)
            {
                result.push({
                    serverName: entry.name,
                    name: prompt.name,
                    description: prompt.description,
                    arguments: prompt.arguments,
                });
            }
        }
        return result;
    }

    async callMCPTool(
        serverName: string,
        toolName: string,
        args: Record<string, unknown>,
    ): Promise<{ ok: boolean; output: string; error?: string }>
    {
        const entry = this.servers.get(serverName);
        if (!entry || entry.status !== "connected" || !entry.client)
        {
            return {
                ok: false,
                output: `MCP server "${serverName}" is not connected`,
                error: `Server "${serverName}" not connected`,
            };
        }

        try
        {
            const result = await entry.client.callTool({ name: toolName, arguments: args });
            const content = Array.isArray(result.content) ? result.content : [];
            const output = toolResultToString(content) || "(empty response)";
            const isError = Boolean((result as { isError?: boolean }).isError);

            return { ok: !isError, output };
        }
        catch (err)
        {
            const message = err instanceof Error ? err.message : String(err);
            return { ok: false, output: message, error: message };
        }
    }

    async readMCPResource(serverName: string, uri: string): Promise<string>
    {
        const entry = this.servers.get(serverName);
        if (!entry?.client) throw new Error(`Server "${serverName}" not connected`);

        const result = await entry.client.readResource({ uri });
        const parts: string[] = [];
        for (const content of result.contents)
        {
            if ("text" in content && typeof content.text === "string")
            {
                parts.push(content.text);
            }
        }
        return parts.join("\n");
    }

    async getMCPPrompt(
        serverName: string,
        promptName: string,
        args?: Record<string, string>,
    ): Promise<string>
    {
        const entry = this.servers.get(serverName);
        if (!entry?.client) throw new Error(`Server "${serverName}" not connected`);

        const result = await entry.client.getPrompt({ name: promptName, arguments: args });
        const parts: string[] = [];
        for (const message of result.messages)
        {
            const c = message.content;
            if (c.type === "text") parts.push(c.text);
        }
        return parts.join("\n\n");
    }

    createDynamicToolResolver(): (toolName: string) => ToolHandler | undefined
    {
        return (toolName: string): ToolHandler | undefined =>
        {
            const mapping = this.toolNameMap.get(toolName);
            if (!mapping) return undefined;

            const { serverName, toolName: mcpToolName } = mapping;

            return async (args) =>
            {
                return this.callMCPTool(serverName, mcpToolName, args);
            };
        };
    }

    getDynamicToolNames(): string[]
    {
        return Array.from(this.toolNameMap.keys());
    }

    generateToolsDoc(): string
    {
        const tools = this.getAllTools();
        if (tools.length === 0) return "";

        const sections: string[] = ["## MCP Инструменты\n"];

        for (const tool of tools)
        {
            const label = tool.title ?? tool.name;
            const desc = tool.description ?? "";
            const schema = tool.inputSchema;
            const props = (schema?.["properties"] as Record<string, Record<string, unknown>> | undefined) ?? {};
            const required = new Set<string>(
                Array.isArray(schema?.["required"]) ? (schema["required"] as string[]) : [],
            );

            const lines: string[] = [
                `### \`${tool.fullName}\``,
                `Сервер: ${tool.serverName} | Инструмент MCP: ${tool.name}`,
            ];
            if (desc) lines.push("", desc);

            if (Object.keys(props).length > 0)
            {
                lines.push("", "**Аргументы:**");
                for (const [propName, propDef] of Object.entries(props))
                {
                    const propType = String(propDef["type"] ?? "any");
                    const propDesc = typeof propDef["description"] === "string" ? propDef["description"] : "";
                    const req = required.has(propName) ? "обязательный" : "необязательный";
                    lines.push(`- \`${propName}\` (${propType}, ${req})${propDesc ? ` — ${propDesc}` : ""}`);
                }
            }

            lines.push(
                "",
                "**Вызов:**",
                "```json",
                JSON.stringify(
                    {
                        tool: tool.fullName,
                        args: Object.fromEntries(
                            Object.keys(props).slice(0, 3).map((k) => [k, "..."]),
                        ),
                        onError: "continue",
                        onSuccess: "continue",
                    },
                    null,
                    4,
                ),
                "```",
            );

            sections.push(lines.join("\n"));
        }

        return sections.join("\n\n");
    }

    async buildResourcesContext(): Promise<string>
    {
        const resources = this.getAllResources();
        if (resources.length === 0) return "";

        const parts: string[] = ["## MCP Ресурсы\n"];
        const textResources = resources.filter(
            (r) => !r.mimeType || r.mimeType.startsWith("text/") || r.mimeType === "application/json",
        );

        for (const resource of textResources)
        {
            try
            {
                const content = await this.readMCPResource(resource.serverName, resource.uri);
                if (content.length > MAX_AUTO_RESOURCE_SIZE) continue;

                parts.push(
                    `### ${resource.name} (${resource.uri})`,
                    resource.description ? resource.description : "",
                    "```",
                    content.trim(),
                    "```",
                );
            }
            catch
            {
                // skip unreadable resources
            }
        }

        return parts.length > 1 ? parts.join("\n\n") : "";
    }

    getPromptsAsSkills(): SkillMeta[]
    {
        const skills: SkillMeta[] = [];

        for (const entry of this.servers.values())
        {
            if (entry.status !== "connected") continue;
            for (const prompt of entry.prompts)
            {
                skills.push({
                    name: `mcp__${sanitizeNamePart(entry.name)}__${prompt.name}`,
                    description: prompt.description ?? `MCP prompt from ${entry.name}`,
                    path: `mcp:${entry.name}/${prompt.name}`,
                    body: `[MCP Prompt: ${prompt.name} from server ${entry.name}]\n${prompt.description ?? ""}`,
                    internal: false,
                });
            }
        }

        return skills;
    }

    hasAnyConnected(): boolean
    {
        return Array.from(this.servers.values()).some((e) => e.status === "connected");
    }

    getServerCount(): number
    {
        return this.servers.size;
    }
}
