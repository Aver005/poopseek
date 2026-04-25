export type MCPTransportKind = "stdio" | "http";

export interface MCPStdioServerConfig
{
    transport: "stdio";
    command: string;
    args?: string[];
    env?: Record<string, string>;
    cwd?: string;
}

export interface MCPHttpServerConfig
{
    transport: "http";
    url: string;
    headers?: Record<string, string>;
}

export type MCPServerConfig = MCPStdioServerConfig | MCPHttpServerConfig;

export interface MCPProjectConfig
{
    servers?: Record<string, MCPServerConfig>;
    autoDiscover?: boolean;
    extraPaths?: string[];
    disabled?: string[];
}

export type MCPServerStatus = "pending" | "connecting" | "connected" | "error" | "disabled";

export interface MCPServerInfo
{
    name: string;
    source: string;
    config: MCPServerConfig;
    status: MCPServerStatus;
    error?: string;
    toolCount: number;
    resourceCount: number;
    promptCount: number;
}

export interface MCPToolInfo
{
    serverName: string;
    fullName: string;
    name: string;
    title?: string;
    description?: string;
    inputSchema: Record<string, unknown>;
}

export interface MCPResourceInfo
{
    serverName: string;
    uri: string;
    name: string;
    description?: string;
    mimeType?: string;
}

export interface MCPPromptInfo
{
    serverName: string;
    name: string;
    description?: string;
    arguments?: Array<{ name: string; description?: string; required?: boolean }>;
}
