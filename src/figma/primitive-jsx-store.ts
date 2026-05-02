import type { FigmaPrimitivesJsxArtifact } from "./artifact-types";

function slugify(value: string): string
{
    const normalized = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
    return normalized || "primitive_jsx";
}

export class PrimitiveJsxStore
{
    private readonly items = new Map<string, FigmaPrimitivesJsxArtifact>();
    private counter = 0;

    create(input: Omit<FigmaPrimitivesJsxArtifact, "id" | "version" | "createdAt" | "type">): FigmaPrimitivesJsxArtifact
    {
        const version = ++this.counter;
        const artifact: FigmaPrimitivesJsxArtifact = {
            id: `primitives_jsx_${slugify(input.primitivesArtifactId)}_v${version}`,
            type: "figma.primitives.jsx",
            version,
            createdAt: Date.now(),
            ...input,
        };

        this.items.set(artifact.id, artifact);
        return artifact;
    }

    get(id: string): FigmaPrimitivesJsxArtifact | undefined
    {
        return this.items.get(id);
    }

    list(): FigmaPrimitivesJsxArtifact[]
    {
        return Array.from(this.items.values());
    }
}
