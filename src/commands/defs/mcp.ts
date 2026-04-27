import { writeLine } from "../io";
import { colors } from "@/cli/colors";
import type { Command, CommandsContext } from "../types";
import type { MCPServerInfo } from "@/mcp";

function statusBadge(status: MCPServerInfo["status"]): string
{
    switch (status)
    {
        case "connected": return colors.green("[connected]");
        case "connecting": return colors.yellow("[connecting]");
        case "error": return colors.red("[error]");
        case "disabled": return colors.dim("[disabled]");
        case "pending": return colors.dim("[pending]");
    }
}

function sourceLabel(source: string): string
{
    switch (source)
    {
        case "workspace": return colors.cyan("workspace");
        case "poopseek-global": return colors.cyan("global");
        case "claude-desktop": return colors.magenta("Claude Desktop");
        case "vscode-workspace": return colors.blue("VS Code workspace");
        case "vscode-global": return colors.blue("VS Code global");
        case "cursor": return colors.blue("Cursor");
        case "cursor-global": return colors.blue("Cursor global");
        case "trae": return colors.blue("Trae");
        case "manual": return colors.dim("manual");
        default:
            return source.startsWith("extra:")
                ? colors.dim(`extra: ${source.slice(6)}`)
                : colors.dim(source);
    }
}

function transportLabel(config: MCPServerInfo["config"]): string
{
    if (config.transport === "http") return `HTTP ${colors.dim(config.url)}`;
    return `STDIO ${colors.dim(config.command)}`;
}

function printHelp(): void
{
    writeLine("");
    writeLine(colors.cyan("MCP — управление серверами Model Context Protocol"));
    writeLine("");
    writeLine("Использование:");
    writeLine(`  ${colors.yellow("/mcp")}                       — статус всех серверов`);
    writeLine(`  ${colors.yellow("/mcp list")}                  — список серверов с деталями`);
    writeLine(`  ${colors.yellow("/mcp tools")} [server]        — список MCP-инструментов`);
    writeLine(`  ${colors.yellow("/mcp resources")} [server]    — список MCP-ресурсов`);
    writeLine(`  ${colors.yellow("/mcp prompts")} [server]      — список MCP-промптов`);
    writeLine(`  ${colors.yellow("/mcp connect")} <server>      — подключить/переподключить сервер`);
    writeLine(`  ${colors.yellow("/mcp disconnect")} <server>   — отключить сервер`);
    writeLine(`  ${colors.yellow("/mcp enable")} <server>       — включить отключённый сервер`);
    writeLine(`  ${colors.yellow("/mcp disable")} <server>      — отключить и заморозить сервер`);
    writeLine(`  ${colors.yellow("/mcp reload")}                — перезагрузить конфиги и переподключиться`);
    writeLine(`  ${colors.yellow("/mcp info")} <server>         — подробная информация о сервере`);
    writeLine(`  ${colors.yellow("/mcp read")} <server> <uri>   — прочитать MCP-ресурс`);
    writeLine(`  ${colors.yellow("/mcp prompt")} <server> <name> — получить MCP-промпт`);
    writeLine("");
}

function printStatus(servers: MCPServerInfo[]): void
{
    writeLine("");
    if (servers.length === 0)
    {
        writeLine(colors.dim("MCP серверов не настроено."));
        writeLine("");
        writeLine(`Создайте ${colors.cyan("mcp.config.json")} в корне проекта для добавления серверов.`);
        writeLine(`Или настройте серверы в Claude Desktop / VS Code / Cursor — они будут обнаружены автоматически.`);
        writeLine("");
        return;
    }

    const connected = servers.filter((s) => s.status === "connected").length;
    const errored = servers.filter((s) => s.status === "error").length;

    writeLine(
        `${colors.cyan("MCP серверы")} — всего: ${servers.length}, ` +
        `подключено: ${colors.green(String(connected))}, ` +
        `ошибок: ${errored > 0 ? colors.red(String(errored)) : colors.dim("0")}`,
    );
    writeLine("");

    for (const server of servers)
    {
        const badge = statusBadge(server.status);
        const transport = transportLabel(server.config);
        writeLine(`  ${badge} ${server.name}  ${colors.dim(`(${sourceLabel(server.source)})`)}`);;
        writeLine(`    ${colors.dim(transport)}`);

        if (server.status === "connected")
        {
            const parts: string[] = [];
            if (server.toolCount > 0) parts.push(`${colors.yellow(String(server.toolCount))} tools`);
            if (server.resourceCount > 0) parts.push(`${colors.blue(String(server.resourceCount))} resources`);
            if (server.promptCount > 0) parts.push(`${colors.magenta(String(server.promptCount))} prompts`);
            if (parts.length > 0) writeLine(`    ${parts.join("  ")}`);
        }
        else if (server.status === "error" && server.error)
        {
            writeLine(`    ${colors.red(server.error)}`);
        }

        writeLine("");
    }
}

export function createMCPCommand(context: CommandsContext): Command
{
    return {
        name: "/mcp",
        description: "Управление MCP серверами: list | tools | resources | prompts | connect | disconnect | enable | disable | reload | info | read | prompt",
        execute: async (args) =>
        {
            const sub = args[0]?.toLowerCase();

            if (!sub || sub === "status" || sub === "list")
            {
                const servers = context.getMCPServerStatuses?.() ?? [];
                printStatus(servers);
                return true;
            }

            if (sub === "help")
            {
                printHelp();
                return true;
            }

            if (sub === "tools")
            {
                const filterServer = args[1];
                const tools = context.getMCPTools?.() ?? [];
                const filtered = filterServer
                    ? tools.filter((t) => t.serverName === filterServer)
                    : tools;

                writeLine("");
                if (filtered.length === 0)
                {
                    writeLine(colors.dim(filterServer
                        ? `Нет инструментов от сервера "${filterServer}".`
                        : "Нет доступных MCP инструментов."));
                    writeLine("");
                    return true;
                }

                writeLine(colors.cyan(`MCP инструменты (${filtered.length}):`));
                writeLine("");

                for (const tool of filtered)
                {
                    writeLine(`  ${colors.yellow(tool.fullName)}`);
                    writeLine(`    ${colors.dim(`сервер: ${tool.serverName} | mcp: ${tool.name}`)}`);
                    if (tool.description) writeLine(`    ${tool.description}`);
                    writeLine("");
                }

                return true;
            }

            if (sub === "resources")
            {
                const filterServer = args[1];
                const resources = context.getMCPResources?.() ?? [];
                const filtered = filterServer
                    ? resources.filter((r) => r.serverName === filterServer)
                    : resources;

                writeLine("");
                if (filtered.length === 0)
                {
                    writeLine(colors.dim("Нет доступных MCP ресурсов."));
                    writeLine("");
                    return true;
                }

                writeLine(colors.cyan(`MCP ресурсы (${filtered.length}):`));
                writeLine("");

                for (const resource of filtered)
                {
                    writeLine(`  ${colors.blue(resource.name)}`);
                    writeLine(`    ${colors.dim(`uri: ${resource.uri}`)}`);
                    writeLine(`    ${colors.dim(`сервер: ${resource.serverName}`)}`);
                    if (resource.mimeType) writeLine(`    ${colors.dim(`type: ${resource.mimeType}`)}`);
                    if (resource.description) writeLine(`    ${resource.description}`);
                    writeLine("");
                }

                return true;
            }

            if (sub === "prompts")
            {
                const filterServer = args[1];
                const prompts = context.getMCPPrompts?.() ?? [];
                const filtered = filterServer
                    ? prompts.filter((p) => p.serverName === filterServer)
                    : prompts;

                writeLine("");
                if (filtered.length === 0)
                {
                    writeLine(colors.dim("Нет доступных MCP промптов."));
                    writeLine("");
                    return true;
                }

                writeLine(colors.cyan(`MCP промпты (${filtered.length}):`));
                writeLine("");

                for (const prompt of filtered)
                {
                    writeLine(`  ${colors.magenta(prompt.name)}`);
                    writeLine(`    ${colors.dim(`сервер: ${prompt.serverName}`)}`);
                    if (prompt.description) writeLine(`    ${prompt.description}`);
                    if (prompt.arguments && prompt.arguments.length > 0)
                    {
                        writeLine(`    Аргументы:`);
                        for (const arg of prompt.arguments)
                        {
                            const req = arg.required ? colors.red("*") : colors.dim("?");
                            writeLine(`      ${req} ${arg.name}${arg.description ? ` — ${arg.description}` : ""}`);
                        }
                    }
                    writeLine(`    ${colors.dim(`Получить: /mcp prompt ${prompt.serverName} ${prompt.name}`)}`);
                    writeLine("");
                }

                return true;
            }

            if (sub === "connect")
            {
                const serverName = args[1];
                if (!serverName)
                {
                    writeLine("");
                    writeLine("Использование: /mcp connect <server>");
                    writeLine("");
                    return true;
                }

                writeLine("");
                writeLine(`Подключаю ${colors.cyan(serverName)}...`);

                try
                {
                    await context.mcpConnect?.(serverName);
                    const servers = context.getMCPServerStatuses?.() ?? [];
                    const server = servers.find((s) => s.name === serverName);

                    if (server?.status === "connected")
                    {
                        writeLine(colors.green(`✓ ${serverName} подключён. Tools: ${server.toolCount}, Resources: ${server.resourceCount}, Prompts: ${server.promptCount}`));
                    }
                    else if (server?.status === "error")
                    {
                        writeLine(colors.red(`✗ Ошибка: ${server.error ?? "неизвестная ошибка"}`));
                    }
                    else
                    {
                        writeLine(colors.dim(`Статус: ${server?.status ?? "unknown"}`));
                    }
                }
                catch (err)
                {
                    writeLine(colors.red(`Ошибка: ${err instanceof Error ? err.message : String(err)}`));
                }

                writeLine("");
                return true;
            }

            if (sub === "disconnect")
            {
                const serverName = args[1];
                if (!serverName)
                {
                    writeLine("");
                    writeLine("Использование: /mcp disconnect <server>");
                    writeLine("");
                    return true;
                }

                writeLine("");
                try
                {
                    await context.mcpDisconnect?.(serverName);
                    writeLine(colors.dim(`${serverName} отключён.`));
                }
                catch (err)
                {
                    writeLine(colors.red(`Ошибка: ${err instanceof Error ? err.message : String(err)}`));
                }

                writeLine("");
                return true;
            }

            if (sub === "enable")
            {
                const serverName = args[1];
                if (!serverName)
                {
                    writeLine("");
                    writeLine("Использование: /mcp enable <server>");
                    writeLine("");
                    return true;
                }

                writeLine("");
                writeLine(`Включаю ${colors.cyan(serverName)}...`);

                try
                {
                    await context.mcpEnable?.(serverName);
                    const servers = context.getMCPServerStatuses?.() ?? [];
                    const server = servers.find((s) => s.name === serverName);
                    if (server?.status === "connected")
                    {
                        writeLine(colors.green(`✓ ${serverName} включён и подключён.`));
                    }
                    else
                    {
                        writeLine(colors.dim(`Статус: ${server?.status ?? "unknown"}`));
                    }
                }
                catch (err)
                {
                    writeLine(colors.red(`Ошибка: ${err instanceof Error ? err.message : String(err)}`));
                }

                writeLine("");
                return true;
            }

            if (sub === "disable")
            {
                const serverName = args[1];
                if (!serverName)
                {
                    writeLine("");
                    writeLine("Использование: /mcp disable <server>");
                    writeLine("");
                    return true;
                }

                writeLine("");
                try
                {
                    await context.mcpDisable?.(serverName);
                    writeLine(colors.dim(`${serverName} отключён и заморожен.`));
                }
                catch (err)
                {
                    writeLine(colors.red(`Ошибка: ${err instanceof Error ? err.message : String(err)}`));
                }

                writeLine("");
                return true;
            }

            if (sub === "reload")
            {
                writeLine("");
                writeLine("Перезагружаю MCP конфиги и переподключаюсь...");

                try
                {
                    await context.mcpReload?.();
                    const servers = context.getMCPServerStatuses?.() ?? [];
                    const connected = servers.filter((s) => s.status === "connected").length;
                    writeLine(colors.green(`✓ Перезагружено. Подключено: ${connected}/${servers.length}`));
                }
                catch (err)
                {
                    writeLine(colors.red(`Ошибка: ${err instanceof Error ? err.message : String(err)}`));
                }

                writeLine("");
                return true;
            }

            if (sub === "info")
            {
                const serverName = args[1];
                if (!serverName)
                {
                    writeLine("");
                    writeLine("Использование: /mcp info <server>");
                    writeLine("");
                    return true;
                }

                const servers = context.getMCPServerStatuses?.() ?? [];
                const server = servers.find((s) => s.name === serverName);

                writeLine("");
                if (!server)
                {
                    writeLine(colors.red(`Сервер "${serverName}" не найден.`));
                    writeLine("");
                    return true;
                }

                writeLine(`${colors.cyan(server.name)}`);
                writeLine(`  Статус:     ${statusBadge(server.status)}`);
                writeLine(`  Источник:   ${sourceLabel(server.source)}`);
                writeLine(`  Транспорт:  ${transportLabel(server.config)}`);

                if (server.config.transport === "stdio")
                {
                    if (server.config.args?.length)
                    {
                        writeLine(`  Аргументы:  ${server.config.args.join(" ")}`);
                    }
                    if (server.config.env && Object.keys(server.config.env).length > 0)
                    {
                        writeLine(`  Env:        ${Object.keys(server.config.env).join(", ")}`);
                    }
                }
                else if (server.config.transport === "http")
                {
                    if (server.config.headers && Object.keys(server.config.headers).length > 0)
                    {
                        writeLine(`  Заголовки:  ${Object.keys(server.config.headers).join(", ")}`);
                    }
                }

                if (server.status === "connected")
                {
                    writeLine(`  Инструменты: ${server.toolCount}`);
                    writeLine(`  Ресурсы:     ${server.resourceCount}`);
                    writeLine(`  Промпты:     ${server.promptCount}`);
                }
                else if (server.status === "error" && server.error)
                {
                    writeLine(`  Ошибка:     ${colors.red(server.error)}`);
                }

                writeLine("");
                return true;
            }

            if (sub === "read")
            {
                const serverName = args[1];
                const uri = args.slice(2).join(" ");

                if (!serverName || !uri)
                {
                    writeLine("");
                    writeLine("Использование: /mcp read <server> <uri>");
                    writeLine("");
                    return true;
                }

                writeLine("");
                writeLine(`Читаю ресурс ${colors.dim(uri)} с сервера ${colors.cyan(serverName)}...`);

                try
                {
                    const content = await context.mcpReadResource?.(serverName, uri);
                    writeLine("");
                    writeLine(content ?? "(пусто)");
                }
                catch (err)
                {
                    writeLine(colors.red(`Ошибка: ${err instanceof Error ? err.message : String(err)}`));
                }

                writeLine("");
                return true;
            }

            if (sub === "prompt")
            {
                const serverName = args[1];
                const promptName = args[2];

                if (!serverName || !promptName)
                {
                    writeLine("");
                    writeLine("Использование: /mcp prompt <server> <prompt_name>");
                    writeLine("");
                    return true;
                }

                writeLine("");
                writeLine(`Получаю промпт ${colors.magenta(promptName)} с сервера ${colors.cyan(serverName)}...`);

                try
                {
                    const content = await context.mcpGetPrompt?.(serverName, promptName);
                    writeLine("");
                    writeLine(content ?? "(пусто)");
                }
                catch (err)
                {
                    writeLine(colors.red(`Ошибка: ${err instanceof Error ? err.message : String(err)}`));
                }

                writeLine("");
                return true;
            }

            printHelp();
            return true;
        },
    };
}
