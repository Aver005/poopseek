import fs from "node:fs";
import path from "node:path";
import type { ILLMProvider } from "@/providers";

export interface SubAgentTask
{
    instruction: string;
    files?: string[];
    context?: Record<string, string>;
    schema?: string;
}

export interface SubAgentResult
{
    ok: boolean;
    data: unknown;
    raw?: string;
    error?: string;
}

function buildPrompt(task: SubAgentTask, fileContents: Record<string, string>): string
{
    const parts = [
        "You are a focused analysis sub-agent. Respond ONLY with a single JSON object wrapped in a ```json``` block. No prose, no explanations — only the JSON block.",
        "",
        "## Task",
        task.instruction,
    ];

    if (task.schema)
    {
        parts.push("", "## Output Format", task.schema);
    }

    const allContext: Record<string, string> = { ...(task.context ?? {}), ...fileContents };
    if (Object.keys(allContext).length > 0)
    {
        parts.push("", "## Context");
        for (const [name, content] of Object.entries(allContext))
        {
            parts.push(`### ${name}`, content);
        }
    }

    return parts.join("\n");
}

function extractJson(text: string): unknown
{
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenced)
    {
        return JSON.parse(fenced[1]!.trim()) as unknown;
    }

    const trimmed = text.trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("["))
    {
        return JSON.parse(trimmed) as unknown;
    }

    throw new Error("No JSON found in sub-agent response");
}

export class SubAgentRunner
{
    constructor(
        private readonly getProvider: () => ILLMProvider,
        private readonly workspaceRoot: string,
    ) {}

    private async readFiles(filePaths: string[]): Promise<Record<string, string>>
    {
        const entries = await Promise.all(
            filePaths.map(async (filePath) =>
            {
                const resolved = path.isAbsolute(filePath)
                    ? filePath
                    : path.resolve(this.workspaceRoot, filePath);
                const content = await fs.promises.readFile(resolved, "utf8");
                return [filePath, content] as const;
            }),
        );
        return Object.fromEntries(entries);
    }

    async run(task: SubAgentTask): Promise<SubAgentResult>
    {
        try
        {
            const fileContents = task.files?.length ? await this.readFiles(task.files) : {};
            const prompt = buildPrompt(task, fileContents);

            const subProvider = await this.getProvider().clone();
            const chunks: string[] = [];
            for await (const chunk of subProvider.complete(prompt))
            {
                chunks.push(chunk);
            }
            const text = chunks.join("");

            try
            {
                const data = extractJson(text);
                return { ok: true, data, raw: text };
            }
            catch
            {
                return { ok: true, data: null, raw: text };
            }
        }
        catch (error)
        {
            const message = error instanceof Error ? error.message : String(error);
            return { ok: false, data: null, error: message };
        }
    }

    async runParallel(tasks: SubAgentTask[]): Promise<SubAgentResult[]>
    {
        return Promise.all(tasks.map((task) => this.run(task)));
    }
}
