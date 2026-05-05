import os from "node:os";
import path from "node:path";
import { mkdir } from "node:fs/promises";

const CACHE_FILE = path.join(os.homedir(), ".poopseek", "thesvg-index.json");
const REGISTRY_URL = "https://thesvg.org/api/registry.json";
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface TheSvgIcon
{
    slug: string;
    title: string;
    aliases: string[];
    variants: string[];
    hex?: string;
}

interface CacheFile
{
    updatedAt: number;
    icons: TheSvgIcon[];
}

let memCache: TheSvgIcon[] | null = null;

function parseRegistry(raw: unknown): TheSvgIcon[]
{
    const entries: unknown[] = Array.isArray(raw)
        ? raw
        : Object.entries(raw as Record<string, unknown>).map(([slug, v]) => ({ slug, ...(v as object) }));

    const icons: TheSvgIcon[] = [];
    for (const entry of entries)
    {
        if (!entry || typeof entry !== "object") continue;
        const e = entry as Record<string, unknown>;
        const slug = String(e.slug ?? "").trim();
        if (!slug) continue;

        const title = String(e.title ?? slug);
        const aliases = Array.isArray(e.aliases) ? e.aliases.map(String) : [];

        let variants: string[];
        if (Array.isArray(e.variants))
            variants = e.variants.map(String);
        else if (e.variants && typeof e.variants === "object")
            variants = Object.keys(e.variants as object);
        else
            variants = ["default"];

        const hex = typeof e.hex === "string" ? e.hex : undefined;
        icons.push({ slug, title, aliases, variants, hex });
    }
    return icons;
}

async function loadFromFile(): Promise<TheSvgIcon[] | null>
{
    try
    {
        const file = Bun.file(CACHE_FILE);
        if (!await file.exists()) return null;
        const data = await file.json() as CacheFile;
        if (!data.updatedAt || !Array.isArray(data.icons)) return null;
        if (Date.now() - data.updatedAt > TTL_MS) return null;
        return data.icons;
    }
    catch { return null; }
}

async function fetchAndSave(): Promise<TheSvgIcon[]>
{
    const res = await fetch(REGISTRY_URL, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const raw = await res.json();
    const icons = parseRegistry(raw);
    const cacheData: CacheFile = { updatedAt: Date.now(), icons };
    await mkdir(path.dirname(CACHE_FILE), { recursive: true });
    await Bun.write(CACHE_FILE, JSON.stringify(cacheData));
    return icons;
}

export async function ensureCache(): Promise<TheSvgIcon[]>
{
    if (memCache) return memCache;
    const fromFile = await loadFromFile();
    if (fromFile) { memCache = fromFile; return fromFile; }
    const fresh = await fetchAndSave();
    memCache = fresh;
    return fresh;
}

export function warmCache(): void
{
    ensureCache().catch(() => {});
}
