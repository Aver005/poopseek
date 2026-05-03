import type { FigmaPrimitiveJsxUpsertInput, FigmaPrimitivesJsxArtifact } from "../artifact-types";

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

    upsert(input: FigmaPrimitiveJsxUpsertInput): FigmaPrimitivesJsxArtifact
    {
        const existing = this.findLatestByPlanId(input.primitivesArtifactId);
        const mergedEntries = new Map<string, FigmaPrimitivesJsxArtifact["entries"][number]>();

        for (const entry of existing?.entries ?? [])
            mergedEntries.set(entry.name, entry);

        for (const entry of input.entries)
            mergedEntries.set(entry.name, entry);

        return this.create({
            primitivesArtifactId: input.primitivesArtifactId,
            entries: Array.from(mergedEntries.values()),
        });
    }

    get(id: string): FigmaPrimitivesJsxArtifact | undefined
    {
        return this.items.get(id);
    }

    list(): FigmaPrimitivesJsxArtifact[]
    {
        return Array.from(this.items.values());
    }

    findLatestByPlanId(primitivesArtifactId: string): FigmaPrimitivesJsxArtifact | undefined
    {
        return this.list()
            .filter((artifact) => artifact.primitivesArtifactId === primitivesArtifactId)
            .at(-1);
    }
}

