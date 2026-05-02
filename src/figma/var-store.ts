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
     * Extract hex-color entries as theme tokens for the Figma compiler.
     * Strips "color/" and "theme/" prefixes to get the token key.
     */
    extractThemeTokens(): Array<{ token: string; hex: string; description?: string }>
    {
        const result: Array<{ token: string; hex: string; description?: string }> = [];
        for (const entry of this.store.values())
        {
            const val = String(entry.value);
            if (!HEX_RE.test(val)) continue;

            const n = entry.name;
            const token = n.startsWith("color/") ? n.slice(6)
                : n.startsWith("theme/") ? n.slice(6)
                : n;

            result.push({ token, hex: val, description: entry.description });
        }
        return result;
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
