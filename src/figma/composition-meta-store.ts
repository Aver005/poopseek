import type { FigmaCompositionMetaArtifact } from "./artifact-types";

function slugify(value: string): string
{
    const normalized = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
    return normalized || "composition";
}

export class CompositionMetaStore
{
    private readonly items = new Map<string, FigmaCompositionMetaArtifact>();
    private counter = 0;

    create(input: Omit<FigmaCompositionMetaArtifact, "id" | "version" | "createdAt" | "type">): FigmaCompositionMetaArtifact
    {
        const version = ++this.counter;
        const artifact: FigmaCompositionMetaArtifact = {
            id: `compose_${slugify(input.screenName)}_v${version}`,
            type: "figma.compose.meta",
            version,
            createdAt: Date.now(),
            ...input,
        };

        this.items.set(artifact.id, artifact);
        return artifact;
    }

    get(id: string): FigmaCompositionMetaArtifact | undefined
    {
        return this.items.get(id);
    }

    list(): FigmaCompositionMetaArtifact[]
    {
        return Array.from(this.items.values());
    }
}
