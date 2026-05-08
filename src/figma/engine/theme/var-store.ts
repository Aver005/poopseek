import type { ThemeToken } from "./theme-state";

export interface VarEntry
{
    name: string;
    value: string | number;
    description?: string;
}

const HEX_RE = /^#[0-9A-Fa-f]{3,8}$/;

export class VariableStore
{
    private readonly store = new Map<string, VarEntry>();

    set(name: string, value: string | number, description?: string): void
    {
        this.store.set(name, { name, value, description });
    }

    get(name: string): VarEntry | undefined
    {
        return this.store.get(name);
    }

    remove(name: string): boolean
    {
        return this.store.delete(name);
    }

    list(): VarEntry[]
    {
        return Array.from(this.store.values());
    }

    setTokens(tokens: Array<{ name: string; value: string | number; description?: string }>): void
    {
        for (const t of tokens)
            this.store.set(t.name, { name: t.name, value: t.value, description: t.description });
    }

    /**
     * Group entries into typed theme tokens. Entries are dispatched into
     * `color`/`spacing`/`radius` by their `<kind>/<key>` prefix.
     *
     * Designer outputs entries like `color/primary`, `spacing/md`, `radius/lg`.
     * Anything that doesn't match a known kind prefix is dropped.
     */
    extractTokens(): ThemeToken[]
    {
        const out: ThemeToken[] = [];
        for (const entry of this.store.values())
        {
            const slash = entry.name.indexOf("/");
            if (slash <= 0) continue;
            const prefix = entry.name.slice(0, slash);
            const key = entry.name.slice(slash + 1);
            if (!key) continue;

            const value = String(entry.value);

            if (prefix === "color")
            {
                if (!HEX_RE.test(value)) continue;
                out.push({ kind: "color", key, value, description: entry.description });
            }
            else if (prefix === "spacing" || prefix === "radius")
            {
                const n = Number(value);
                if (!Number.isFinite(n)) continue;
                out.push({ kind: prefix, key, value: String(n), description: entry.description });
            }
        }
        return out;
    }

    /** @deprecated Use extractTokens(). Returns colors-only for backward compat. */
    extractThemeTokens(): Array<{ token: string; hex: string; description?: string }>
    {
        return this.extractTokens()
            .filter(t => t.kind === "color")
            .map(t => ({ token: t.key, hex: t.value, description: t.description }));
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
