import type { FigmaCompositionJsxArtifact } from "./artifact-types";

function slugify(value: string): string
{
    const normalized = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
    return normalized || "composition_jsx";
}

export class CompositionJsxStore
{
    private readonly items = new Map<string, FigmaCompositionJsxArtifact>();
    private counter = 0;
    private readonly byCompositionId = new Map<string, string>();

    create(input: Omit<FigmaCompositionJsxArtifact, "id" | "version" | "createdAt" | "type">): FigmaCompositionJsxArtifact
    {
        const version = ++this.counter;
        const artifact: FigmaCompositionJsxArtifact = {
            id: `compose_jsx_${slugify(input.compositionArtifactId)}_v${version}`,
            type: "figma.compose.jsx",
            version,
            createdAt: Date.now(),
            ...input,
        };

        this.items.set(artifact.id, artifact);
        this.byCompositionId.set(artifact.compositionArtifactId, artifact.id);
        return artifact;
    }

    get(id: string): FigmaCompositionJsxArtifact | undefined
    {
        return this.items.get(id);
    }

    getByCompositionId(compositionArtifactId: string): FigmaCompositionJsxArtifact | undefined
    {
        const artifactId = this.byCompositionId.get(compositionArtifactId);
        return artifactId ? this.items.get(artifactId) : undefined;
    }

    list(): FigmaCompositionJsxArtifact[]
    {
        return Array.from(this.items.values());
    }
}
