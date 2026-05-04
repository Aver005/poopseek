import path from "node:path";
import type { ContextManagerState } from "@/agent/context-manager";

const SESSIONS_DIR = path.join(
    process.env["APPDATA"] ?? path.join(process.env["HOME"] ?? "~", ".config"),
    "poopseek",
    "figma-sessions",
);

function sanitizeName(documentName: string): string
{
    return documentName.replace(/[^a-zA-Z0-9а-яА-ЯёЁ._-]/g, "_").slice(0, 120);
}

function sessionPath(documentName: string): string
{
    return path.join(SESSIONS_DIR, `${sanitizeName(documentName)}.json`);
}

export async function saveHandymanHistory(documentName: string, state: ContextManagerState): Promise<void>
{
    if (!documentName.trim() || state.messages.length === 0) return;

    const file = Bun.file(sessionPath(documentName));
    const dir = path.dirname(file.name!);

    const { mkdir } = await import("node:fs/promises");
    await mkdir(dir, { recursive: true });
    await Bun.write(file, JSON.stringify(state, null, 2));
}

export async function loadHandymanHistory(documentName: string): Promise<ContextManagerState | null>
{
    if (!documentName.trim()) return null;

    const file = Bun.file(sessionPath(documentName));
    if (!(await file.exists())) return null;

    try
    {
        const raw = await file.json() as unknown;
        if (raw && typeof raw === "object" && Array.isArray((raw as Record<string, unknown>).messages))
            return raw as ContextManagerState;
        return null;
    }
    catch
    {
        return null;
    }
}
