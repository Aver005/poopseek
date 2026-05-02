import type { FigmaPrimitivesPlanArtifact } from "./artifact-types";

function slugify(value: string): string
{
    const normalized = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
    return normalized || "primitives";
}

export class PrimitivePlanStore
{
    private readonly items = new Map<string, FigmaPrimitivesPlanArtifact>();
    private counter = 0;

    create(input: Omit<FigmaPrimitivesPlanArtifact, "id" | "version" | "createdAt" | "type">): FigmaPrimitivesPlanArtifact
    {
        const version = ++this.counter;
        const artifact: FigmaPrimitivesPlanArtifact = {
            id: `primitives_${slugify(input.target ?? input.brief ?? "plan")}_v${version}`,
            type: "figma.primitives.plan",
            version,
            createdAt: Date.now(),
            ...input,
        };

        this.items.set(artifact.id, artifact);
        return artifact;
    }

    get(id: string): FigmaPrimitivesPlanArtifact | undefined
    {
        return this.items.get(id);
    }

    list(): FigmaPrimitivesPlanArtifact[]
    {
        return Array.from(this.items.values());
    }
}
