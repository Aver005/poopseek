import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import type { MCPProjectConfig, MCPServerConfig } from "./types";

function tryReadJson<T>(filePath: string): T | null
{
    try
    {
        if (!fs.existsSync(filePath)) return null;
        return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
    }
    catch
    {
        return null;
    }
}

interface ExternalStdioEntry
{
    command?: string;
    args?: string[];
    env?: Record<string, string>;
    cwd?: string;
    url?: string;
    headers?: Record<string, string>;
    type?: string;
}

interface ClaudeDesktopConfig
{
    mcpServers?: Record<string, ExternalStdioEntry>;
}

interface VSCodeMCPSection
{
    servers?: Record<string, ExternalStdioEntry>;
}

interface VSCodeSettingsFile
{
    mcp?: VSCodeMCPSection;
}

function parseExternalServers(
    entries: Record<string, ExternalStdioEntry>,
): Record<string, MCPServerConfig>
{
    const servers: Record<string, MCPServerConfig> = {};

    for (const [name, entry] of Object.entries(entries))
    {
        const kind = entry.type ?? (entry.url ? "http" : "stdio");

        if ((kind === "http" || kind === "sse") && entry.url)
        {
            servers[name] = {
                transport: "http",
                url: entry.url,
                headers: entry.headers,
            };
        }
        else if (entry.command)
        {
            servers[name] = {
                transport: "stdio",
                command: entry.command,
                args: entry.args,
                env: entry.env,
                cwd: entry.cwd,
            };
        }
    }

    return servers;
}

function getAppDataDir(): string
{
    if (process.platform === "win32")
    {
        return process.env["APPDATA"] ?? path.join(os.homedir(), "AppData", "Roaming");
    }
    return path.join(os.homedir(), ".config");
}

function getPoopseekConfigDir(): string
{
    if (process.platform === "win32")
    {
        return path.join(getAppDataDir(), "poopseek");
    }
    return path.join(os.homedir(), ".config", "poopseek");
}

export interface LoadedMCPConfig
{
    servers: Map<string, { config: MCPServerConfig; source: string }>;
    disabled: Set<string>;
    workspaceConfig: MCPProjectConfig | null;
}

function mergeServers(
    into: Map<string, { config: MCPServerConfig; source: string }>,
    servers: Record<string, MCPServerConfig>,
    source: string,
): void
{
    for (const [name, config] of Object.entries(servers))
    {
        if (!into.has(name))
        {
            into.set(name, { config, source });
        }
    }
}

export function loadMCPConfig(workspaceRoot: string): LoadedMCPConfig
{
    const result: LoadedMCPConfig = {
        servers: new Map(),
        disabled: new Set(),
        workspaceConfig: null,
    };

    // 1. Workspace mcp.config.json — highest priority
    const workspaceConfigPath = path.join(workspaceRoot, "mcp.config.json");
    const workspaceConfig = tryReadJson<MCPProjectConfig>(workspaceConfigPath);
    result.workspaceConfig = workspaceConfig;

    if (workspaceConfig?.servers)
    {
        mergeServers(result.servers, workspaceConfig.servers, "workspace");
    }

    for (const name of workspaceConfig?.disabled ?? [])
    {
        result.disabled.add(name);
    }

    const autoDiscover = workspaceConfig?.autoDiscover !== false;

    // 2. Extra paths from workspace config
    for (const rawPath of workspaceConfig?.extraPaths ?? [])
    {
        const resolved = rawPath.startsWith("~")
            ? path.join(os.homedir(), rawPath.slice(1))
            : rawPath;

        const directConfig = tryReadJson<MCPProjectConfig>(resolved);
        if (directConfig?.servers)
        {
            mergeServers(result.servers, directConfig.servers, `extra:${resolved}`);
            continue;
        }

        const claudeStyle = tryReadJson<ClaudeDesktopConfig>(resolved);
        if (claudeStyle?.mcpServers)
        {
            mergeServers(
                result.servers,
                parseExternalServers(claudeStyle.mcpServers),
                `extra:${resolved}`,
            );
        }
    }

    if (!autoDiscover) return result;

    // 3. Global poopseek config
    const globalConfigPath = path.join(getPoopseekConfigDir(), "mcp.config.json");
    const globalConfig = tryReadJson<MCPProjectConfig>(globalConfigPath);
    if (globalConfig?.servers)
    {
        mergeServers(result.servers, globalConfig.servers, "poopseek-global");
    }

    // 4. Claude Desktop
    const claudeDesktopPath = path.join(getAppDataDir(), "Claude", "claude_desktop_config.json");
    const claudeDesktop = tryReadJson<ClaudeDesktopConfig>(claudeDesktopPath);
    if (claudeDesktop?.mcpServers)
    {
        mergeServers(
            result.servers,
            parseExternalServers(claudeDesktop.mcpServers),
            "claude-desktop",
        );
    }

    // 5. VS Code workspace .vscode/mcp.json
    const vscodeWorkspaceMCP = tryReadJson<VSCodeMCPSection>(
        path.join(workspaceRoot, ".vscode", "mcp.json"),
    );
    if (vscodeWorkspaceMCP?.servers)
    {
        mergeServers(
            result.servers,
            parseExternalServers(vscodeWorkspaceMCP.servers),
            "vscode-workspace",
        );
    }

    // 6. VS Code global settings
    const vscodeGlobal = tryReadJson<VSCodeSettingsFile>(
        path.join(getAppDataDir(), "Code", "User", "settings.json"),
    );
    if (vscodeGlobal?.mcp?.servers)
    {
        mergeServers(
            result.servers,
            parseExternalServers(vscodeGlobal.mcp.servers),
            "vscode-global",
        );
    }

    // 7. Cursor global ~/.cursor/mcp.json
    const cursorMCP = tryReadJson<ClaudeDesktopConfig>(
        path.join(os.homedir(), ".cursor", "mcp.json"),
    );
    if (cursorMCP?.mcpServers)
    {
        mergeServers(
            result.servers,
            parseExternalServers(cursorMCP.mcpServers),
            "cursor",
        );
    }

    // 8. Cursor global settings
    const cursorSettings = tryReadJson<VSCodeSettingsFile>(
        path.join(getAppDataDir(), "Cursor", "User", "settings.json"),
    );
    if (cursorSettings?.mcp?.servers)
    {
        mergeServers(
            result.servers,
            parseExternalServers(cursorSettings.mcp.servers),
            "cursor-global",
        );
    }

    // 9. Trae IDE
    const traeMCP = tryReadJson<ClaudeDesktopConfig>(
        path.join(getAppDataDir(), "Trae", "User", "mcp.json"),
    );
    if (traeMCP?.mcpServers)
    {
        mergeServers(
            result.servers,
            parseExternalServers(traeMCP.mcpServers),
            "trae",
        );
    }

    return result;
}
