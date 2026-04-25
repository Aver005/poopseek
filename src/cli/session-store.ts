import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ContextManagerState } from "@/agent/context-manager";
import type { ModelType } from "@/deepseek-client/types";
import { writeTextFile } from "@/tools/utils/write-text-file";

export interface StoredSessionSnapshot
{
    version: 1;
    id: string;
    createdAt: string;
    updatedAt: string;
    workspaceRoot: string;
    modelType: ModelType;
    context: ContextManagerState;
}

export interface StoredSessionSummary
{
    id: string;
    createdAt: string;
    updatedAt: string;
    workspaceRoot: string;
    modelType: ModelType;
    messageCount: number;
    title: string;
}

interface ParsedStoredSessionFile
{
    snapshot: StoredSessionSnapshot;
    summary: StoredSessionSummary;
}

function isRecord(value: unknown): value is Record<string, unknown>
{
    return typeof value === "object" && value !== null;
}

function normalizeString(value: unknown): string | null
{
    return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function normalizeModelType(value: unknown): ModelType
{
    return value === "expert" ? "expert" : "default";
}

export function deriveSessionTitle(context: ContextManagerState): string
{
    const reversedMessages = [...context.messages].reverse();
    for (const message of reversedMessages)
    {
        if (message.role !== "user" && message.role !== "assistant") continue;
        const collapsed = message.content.replace(/\s+/g, " ").trim();
        if (collapsed.length === 0) continue;
        return collapsed.length > 80 ? `${collapsed.slice(0, 80)}...` : collapsed;
    }

    return "Пустая сессия";
}

function buildSessionSummary(snapshot: StoredSessionSnapshot): StoredSessionSummary
{
    return {
        id: snapshot.id,
        createdAt: snapshot.createdAt,
        updatedAt: snapshot.updatedAt,
        workspaceRoot: snapshot.workspaceRoot,
        modelType: snapshot.modelType,
        messageCount: snapshot.context.messages.length,
        title: deriveSessionTitle(snapshot.context),
    };
}

function parseStoredSession(raw: unknown): ParsedStoredSessionFile | null
{
    if (!isRecord(raw)) return null;

    const version = raw.version;
    const id = normalizeString(raw.id);
    const createdAt = normalizeString(raw.createdAt);
    const updatedAt = normalizeString(raw.updatedAt);
    const workspaceRoot = normalizeString(raw.workspaceRoot);
    const contextValue = raw.context;

    if (
        version !== 1
        || !id
        || !createdAt
        || !updatedAt
        || !workspaceRoot
        || !isRecord(contextValue)
        || !Array.isArray(contextValue.messages)
    )
    {
        return null;
    }

    const messages = contextValue.messages.flatMap((message): ContextManagerState["messages"] =>
    {
        if (!isRecord(message)) return [];
        const role = normalizeString(message.role);
        const content = typeof message.content === "string" ? message.content : null;
        const name = normalizeString(message.name);

        if (
            (role !== "user" && role !== "assistant" && role !== "tool" && role !== "system")
            || content === null
        )
        {
            return [];
        }

        return [{ role, content, name: name ?? undefined }];
    });

    const snapshot: StoredSessionSnapshot = {
        version: 1,
        id,
        createdAt,
        updatedAt,
        workspaceRoot,
        modelType: normalizeModelType(raw.modelType),
        context: { messages },
    };

    return {
        snapshot,
        summary: buildSessionSummary(snapshot),
    };
}

function getSessionFilePath(sessionsDir: string, id: string): string
{
    return path.join(sessionsDir, `${id}.json`);
}

export function getSessionsDirectory(): string
{
    return path.join(os.homedir(), ".poopseek", "sessions");
}

export function createStoredSessionId(now: Date = new Date()): string
{
    const timestamp = now.toISOString().replace(/[:.]/g, "-");
    const suffix = Math.random().toString(36).slice(2, 8);
    return `${timestamp}-${suffix}`;
}

export async function saveStoredSession(
    sessionsDir: string,
    session: Omit<StoredSessionSnapshot, "version" | "updatedAt"> & { updatedAt?: string },
): Promise<StoredSessionSnapshot>
{
    const snapshot: StoredSessionSnapshot = {
        version: 1,
        ...session,
        updatedAt: session.updatedAt ?? new Date().toISOString(),
    };

    const payload = JSON.stringify(snapshot, null, 2);
    await writeTextFile(getSessionFilePath(sessionsDir, snapshot.id), `${payload}\n`);
    return snapshot;
}

export async function listStoredSessions(sessionsDir: string): Promise<StoredSessionSummary[]>
{
    try
    {
        const entries = await fs.promises.readdir(sessionsDir, { withFileTypes: true });
        const sessions = await Promise.all(entries
            .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
            .map(async (entry) =>
            {
                const filePath = path.join(sessionsDir, entry.name);
                try
                {
                    const raw = JSON.parse(await fs.promises.readFile(filePath, "utf8")) as unknown;
                    return parseStoredSession(raw)?.summary ?? null;
                }
                catch
                {
                    return null;
                }
            }));

        return sessions
            .filter((session): session is StoredSessionSummary => session !== null)
            .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    }
    catch (error)
    {
        const nodeError = error as NodeJS.ErrnoException;
        if (nodeError.code === "ENOENT") return [];
        throw error;
    }
}

export async function loadStoredSession(
    sessionsDir: string,
    id: string,
): Promise<StoredSessionSnapshot | null>
{
    try
    {
        const raw = JSON.parse(
            await fs.promises.readFile(getSessionFilePath(sessionsDir, id), "utf8"),
        ) as unknown;
        return parseStoredSession(raw)?.snapshot ?? null;
    }
    catch (error)
    {
        const nodeError = error as NodeJS.ErrnoException;
        if (nodeError.code === "ENOENT") return null;
        throw error;
    }
}
