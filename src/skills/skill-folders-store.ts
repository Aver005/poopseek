import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { writeTextFile } from "@/tools/utils/write-text-file";

function getSkillFoldersPath(): string
{
    return path.join(os.homedir(), ".poopseek", "skill-folders.json");
}

export async function loadSkillFolders(): Promise<string[]>
{
    const filePath = getSkillFoldersPath();
    if (!fs.existsSync(filePath)) return [];
    try
    {
        const raw = await fs.promises.readFile(filePath, "utf8");
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.every((item) => typeof item === "string"))
        {
            return parsed;
        }
    }
    catch
    {
        // ignore corrupt file
    }
    return [];
}

export async function saveSkillFolders(folders: string[]): Promise<void>
{
    const filePath = getSkillFoldersPath();
    await writeTextFile(filePath, JSON.stringify(folders, null, 2));
}
