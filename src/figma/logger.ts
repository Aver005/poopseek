import path from "node:path";
import os from "node:os";
import { mkdir, appendFile, readdir } from "node:fs/promises";
import type { ContextManagerState } from "@/agent/context-manager";
import type { ToolExecutionResult } from "@/agent/types";

const JAMS_DIR = path.join(os.homedir(), ".poopseek", "figma", "jams");

function iso(): string
{
    return new Date().toISOString();
}

export class FigmaLogger
{
    private readonly jamDir: string;
    private readonly logPath: string;
    private readonly contextPath: string;

    constructor(
        readonly sessionId: string,
        private readonly onChatLine: (text: string) => void,
    )
    {
        this.jamDir = path.join(JAMS_DIR, sessionId);
        this.logPath = path.join(this.jamDir, `${sessionId}.log`);
        this.contextPath = path.join(this.jamDir, "context.json");
    }

    static getJamsDir(): string { return JAMS_DIR; }

    static async loadContext(sessionId: string): Promise<ContextManagerState | null>
    {
        try
        {
            const file = Bun.file(path.join(JAMS_DIR, sessionId, "context.json"));
            if (!await file.exists()) return null;
            return await file.json() as ContextManagerState;
        }
        catch
        {
            return null;
        }
    }

    static async listJamIds(): Promise<string[]>
    {
        try
        {
            const entries = await readdir(JAMS_DIR, { withFileTypes: true });
            return entries
                .filter((e) => e.isDirectory())
                .map((e) => e.name)
                .sort()
                .reverse();
        }
        catch
        {
            return [];
        }
    }

    async init(): Promise<void>
    {
        await mkdir(this.jamDir, { recursive: true });
        const isNew = !(await Bun.file(this.contextPath).exists());
        await appendFile(
            this.logPath,
            `[${iso()}] JAM ${isNew ? "START" : "RESUME"} id=${this.sessionId}\n`,
        );
    }

    async logTool(
        toolName: string,
        args: Record<string, unknown>,
        result: ToolExecutionResult,
        durationMs: number,
    ): Promise<void>
    {
        const status = result.ok ? "ok" : "err";
        await appendFile(
            this.logPath,
            `[${iso()}] TOOL ${toolName} ${status} (${durationMs}ms) args=${JSON.stringify(args)}\n`,
        );
        this.onChatLine(`[figma] ${toolName} ${status} (${durationMs}ms)`);
    }

    async saveContext(state: ContextManagerState): Promise<void>
    {
        await Bun.write(this.contextPath, JSON.stringify(state, null, 2));
        await appendFile(
            this.logPath,
            `[${iso()}] CONTEXT SAVED (${state.messages.length} msgs)\n`,
        );
    }
}
