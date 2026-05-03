import type { FigmaCompileArtifact } from "../artifact-types";

function slugify(value: string): string
{
    const normalized = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
    return normalized || "compile";
}

export class CompileArtifactStore
{
    private readonly items = new Map<string, FigmaCompileArtifact>();
    private counter = 0;

    create(input: Omit<FigmaCompileArtifact, "id" | "version" | "createdAt" | "type">): FigmaCompileArtifact
    {
        const version = ++this.counter;
        const artifact: FigmaCompileArtifact = {
            id: `compile_${slugify(input.compositionArtifactId)}_v${version}`,
            type: "figma.compile",
            version,
            createdAt: Date.now(),
            ...input,
        };

        this.items.set(artifact.id, artifact);
        return artifact;
    }

    get(id: string): FigmaCompileArtifact | undefined
    {
        return this.items.get(id);
    }

    list(): FigmaCompileArtifact[]
    {
        return Array.from(this.items.values());
    }
}

