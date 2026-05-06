import crypto from "node:crypto";

export interface EnhanceCacheEntry
{
    enhanced: string;
    tokens: { name: string; value: string }[];
    createdAt: number;
}

export class EnhanceCache
{
    private store = new Map<string, EnhanceCacheEntry>();
    private maxSize: number;
    private ttlMs: number;

    constructor(maxSize = 100, ttlMs = 30 * 60 * 1000)
    {
        this.maxSize = maxSize;
        this.ttlMs = ttlMs;
    }

    private hash(message: string): string
    {
        return crypto.createHash("md5").update(message.trim().toLowerCase()).digest("hex");
    }

    get(message: string): EnhanceCacheEntry | undefined
    {
        const key = this.hash(message);
        const entry = this.store.get(key);
        if (!entry) return undefined;
        if (Date.now() - entry.createdAt > this.ttlMs)
        {
            this.store.delete(key);
            return undefined;
        }
        return entry;
    }

    set(message: string, entry: Omit<EnhanceCacheEntry, "createdAt">): void
    {
        const key = this.hash(message);
        if (this.store.size >= this.maxSize)
        {
            const first = this.store.keys().next().value;
            if (first) this.store.delete(first);
        }
        this.store.set(key, { ...entry, createdAt: Date.now() });
    }

    clear(): void
    {
        this.store.clear();
    }

    get size(): number
    {
        return this.store.size;
    }
}