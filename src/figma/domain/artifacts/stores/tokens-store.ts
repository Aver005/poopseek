import type { FigmaTokensArtifact } from "../artifact-types";

function slugify(value: string): string
{
    const normalized = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
    return normalized || "tokens";
}

export class TokensStore
{
    private readonly items = new Map<string, FigmaTokensArtifact>();
    private counter = 0;
    private latestId: string | null = null;

    create(input: Omit<FigmaTokensArtifact, "id" | "version" | "createdAt" | "type">): FigmaTokensArtifact
    {
        const version = ++this.counter;
        const artifact: FigmaTokensArtifact = {
            id: `tokens_${slugify(input.themeName)}_v${version}`,
            type: "figma.tokens",
            version,
            createdAt: Date.now(),
            ...input,
        };

        this.items.set(artifact.id, artifact);
        this.latestId = artifact.id;
        return artifact;
    }

    get(id: string): FigmaTokensArtifact | undefined
    {
        return this.items.get(id);
    }

    latest(): FigmaTokensArtifact | undefined
    {
        return this.latestId ? this.items.get(this.latestId) : undefined;
    }

    list(): FigmaTokensArtifact[]
    {
        return Array.from(this.items.values());
    }
}

