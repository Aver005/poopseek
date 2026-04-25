import path from "node:path";
import { getToolNames, toolsRegistry } from "@/tools";
import { toStringValue } from "@/tools/args";
import type { AskUserFn, CommandResult, ToolContext } from "@/tools/types";
import type { ToolCallEnvelope, ToolExecutionResult } from "./types";

function isRecord(value: unknown): value is Record<string, unknown>
{
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

export default class ToolExecutor
{
    private readonly workspaceRoot: string;
    private readonly askUser: AskUserFn;
    private readonly getSkillContent: ((name: string) => string | null) | undefined;

    constructor(
        workspaceRoot: string = process.cwd(),
        askUser?: AskUserFn,
        getSkillContent?: (name: string) => string | null,
    )
    {
        this.workspaceRoot = path.resolve(workspaceRoot);
        this.askUser = askUser ?? (() => Promise.resolve(null));
        this.getSkillContent = getSkillContent;
    }

    private resolvePath(inputPath: string): string
    {
        const candidate = path.isAbsolute(inputPath)
            ? path.resolve(inputPath)
            : path.resolve(this.workspaceRoot, inputPath);

        const normalizedRoot = `${this.workspaceRoot}${path.sep}`;
        const normalizedCandidate = `${candidate}${path.sep}`;
        const isInsideWorkspace =
            normalizedCandidate.startsWith(normalizedRoot) ||
            candidate === this.workspaceRoot;

        if (!isInsideWorkspace)
        {
            throw new Error("Path is outside workspace root");
        }

        return candidate;
    }

    private async runCommand(
        kind: "powershell" | "bash",
        args: Record<string, unknown>,
    ): Promise<CommandResult>
    {
        const command = toStringValue(args.command);
        if (!command)
        {
            throw new Error("Missing required args.command");
        }

        const cwdValue = toStringValue(args.cwd);
        const timeoutMsRaw = args.timeoutMs;
        const timeoutMs =
            typeof timeoutMsRaw === "number" && Number.isFinite(timeoutMsRaw)
                ? timeoutMsRaw
                : 30_000;
        const cwd = cwdValue ? this.resolvePath(cwdValue) : this.workspaceRoot;

        const cmd =
            kind === "powershell"
                ? ["powershell", "-NoProfile", "-Command", command]
                : ["bash", "-lc", command];

        const processRef = Bun.spawn({
            cmd,
            cwd,
            stdout: "pipe",
            stderr: "pipe",
        });

        const timeoutPromise = new Promise<never>((_, reject) =>
        {
            const timer = setTimeout(() =>
            {
                processRef.kill();
                reject(new Error(`Command timed out after ${timeoutMs}ms`));
            }, timeoutMs);

            processRef.exited.finally(() => clearTimeout(timer)).catch(() => undefined);
        });

        await Promise.race([processRef.exited, timeoutPromise]);

        const code = await processRef.exited;
        const stdout = await new Response(processRef.stdout).text();
        const stderr = await new Response(processRef.stderr).text();

        return {
            code,
            stdout,
            stderr,
        };
    }

    private getContext(): ToolContext
    {
        return {
            workspaceRoot: this.workspaceRoot,
            getToolNames,
            resolvePath: (inputPath: string) => this.resolvePath(inputPath),
            runCommand: async (
                kind: "powershell" | "bash",
                args: Record<string, unknown>,
            ) => this.runCommand(kind, args),
            askUser: this.askUser,
            getSkillContent: this.getSkillContent,
        };
    }

    async execute(toolCall: ToolCallEnvelope): Promise<ToolExecutionResult>
    {
        const args = isRecord(toolCall.args) ? toolCall.args : {};

        try
        {
            const toolHandler = toolsRegistry[toolCall.tool];
            if (toolHandler)
            {
                return await toolHandler(args, this.getContext());
            }

            return {
                ok: false,
                output: `Unknown tool: ${toolCall.tool}. Available: ${getToolNames().join(", ")}`,
                error: `Unknown tool: ${toolCall.tool}`,
            };
        }
        catch (error)
        {
            const message = error instanceof Error ? error.message : "Unknown tool error";
            return {
                ok: false,
                output: message,
                error: message,
            };
        }
    }
}
