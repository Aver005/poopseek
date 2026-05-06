import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import os from "node:os";

function getCachePath(): string
{
    const appDataPath = process.env.APPDATA?.trim() || null;
    const basePath = appDataPath ?? path.join(os.homedir(), "AppData", "Roaming");
    return path.join(basePath, "poopseek", "file-id-cache.json");
}

export default class FileCacheService
{
    private readonly cachePath: string;
    private cache: Record<string, string> | null = null;

    constructor()
    {
        this.cachePath = getCachePath();
    }

    get(md5: string): string | undefined
    {
        return this.load()[md5];
    }

    set(md5: string, fileId: string): void
    {
        const c = this.load();
        c[md5] = fileId;
        this.save(c);
    }

    private load(): Record<string, string>
    {
        if (this.cache !== null) return this.cache;
        try
        {
            const text = readFileSync(this.cachePath, "utf8");
            this.cache = JSON.parse(text) as Record<string, string>;
        }
        catch
        {
            this.cache = {};
        }
        return this.cache;
    }

    private save(c: Record<string, string>): void
    {
        try
        {
            mkdirSync(path.dirname(this.cachePath), { recursive: true });
            writeFileSync(this.cachePath, JSON.stringify(c, null, 2), "utf8");
        }
        catch
        {
            // ignore write failures silently
        }
    }
}
