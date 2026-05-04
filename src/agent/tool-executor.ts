import path from "node:path";
import { getToolNames, toolsRegistry } from "@/tools";
import { toStringValue } from "@/tools/args";
import { checkRateLimit } from "@/utils/rate-limiter";
import type { AskUserFn, CommandResult, ToolContext } from "@/tools/types";
import type { ToolCallEnvelope, ToolExecutionResult } from "./types";
import type { SubAgentRunner } from "./sub-agent";

function isRecord(value: unknown): value is Record<string, unknown>
{
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

export default class ToolExecutor
{
    private readonly workspaceRoot: string;
    private readonly askUser: AskUserFn;
    private readonly getSkillContent: ((name: string) => string | null) | undefined;
    private readonly dynamicToolResolver: ((name: string) => import("@/tools/types").ToolHandler | undefined) | undefined;
    private readonly getDynamicToolNames: (() => string[]) | undefined;
    private readonly subAgentRunner: SubAgentRunner | undefined;
    private readonly onProgress: ((message: string) => void) | undefined;

    constructor(
        workspaceRoot: string = process.cwd(),
        askUser?: AskUserFn,
        getSkillContent?: (name: string) => string | null,
        dynamicToolResolver?: (name: string) => import("@/tools/types").ToolHandler | undefined,
        getDynamicToolNames?: () => string[],
        subAgentRunner?: SubAgentRunner,
        onProgress?: (message: string) => void,
    )
    {
        this.workspaceRoot = path.resolve(workspaceRoot);
        this.askUser = askUser ?? (() => Promise.resolve(null));
        this.getSkillContent = getSkillContent;
        this.dynamicToolResolver = dynamicToolResolver;
        this.getDynamicToolNames = getDynamicToolNames;
        this.subAgentRunner = subAgentRunner;
        this.onProgress = onProgress;
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

    private getContext(currentToolCall?: ToolCallEnvelope): ToolContext
    {
        return {
            workspaceRoot: this.workspaceRoot,
            currentToolCall,
            getToolNames: () => this.getDynamicToolNames?.() ?? getToolNames(),
            resolvePath: (inputPath: string) => this.resolvePath(inputPath),
            runCommand: async (
                kind: "powershell" | "bash",
                args: Record<string, unknown>,
            ) => this.runCommand(kind, args),
            askUser: this.askUser,
            getSkillContent: this.getSkillContent,
            spawnSubAgent: this.subAgentRunner
                ? (task) => this.subAgentRunner!.run(task)
                : undefined,
            spawnSubAgents: this.subAgentRunner
                ? (tasks) => this.subAgentRunner!.runParallel(tasks)
                : undefined,
            onProgress: this.onProgress,
        };
    }

    async execute(toolCall: ToolCallEnvelope): Promise<ToolExecutionResult>
    {
        const rateCheck = checkRateLimit(toolCall.tool);
        if (!rateCheck.allowed)
        {
            return {
                ok: false,
                output: rateCheck.error ?? "Rate limit exceeded",
                error: rateCheck.error,
            };
        }

        const args = isRecord(toolCall.args) ? toolCall.args : {};

        try
        {
            // When dynamic tools are provided, they are the ONLY tools (isolated mode).
            // Fall back to global registry only when no dynamic resolver is present.
            const toolHandler = this.dynamicToolResolver
                ? this.dynamicToolResolver(toolCall.tool)
                : toolsRegistry[toolCall.tool];

            if (toolHandler)
            {
                return await toolHandler(args, this.getContext(toolCall));
            }

            const allNames = this.getDynamicToolNames?.() ?? getToolNames();
            return {
                ok: false,
                output: `Unknown tool: ${toolCall.tool}. Available: ${allNames.join(", ")}`,
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
