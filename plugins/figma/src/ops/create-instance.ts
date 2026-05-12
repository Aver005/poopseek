import type { OpHandler } from "./types";
import { nodeMap, componentRegistry } from "../cache";
import { resolveParent, componentRegistryKey, assignLogicalId } from "../helpers";
import { dlog, derr, describeNode } from "../debug";

// Resolve a master ComponentNode for `of=` + variant attrs. Lookup order:
//   1. Exact composite key  "Button/state=hover,size=md"
//   2. Same name with any-one-axis subset  (try fewer axes when more)
//   3. Bare name              "Button"
async function resolveMaster(
    name: string,
    variants: Record<string, string> | undefined,
): Promise<ComponentNode | null>
{
    const tryKey = async (key: string): Promise<ComponentNode | null> =>
    {
        const id = componentRegistry.get(key);
        if (!id) return null;
        const node = await figma.getNodeByIdAsync(id);
        if (!node) return null;
        if (node.type === "COMPONENT") return node as ComponentNode;
        return null;
    };

    if (variants && Object.keys(variants).length > 0)
    {
        const exact = await tryKey(componentRegistryKey(name, variants));
        if (exact) return exact;

        // Subset fallback: drop axes one at a time
        const axes = Object.keys(variants);
        for (let dropCount = 1; dropCount < axes.length; dropCount++)
        {
            for (const drop of axes)
            {
                const subset: Record<string, string> = { ...variants };
                delete subset[drop];
                const found = await tryKey(componentRegistryKey(name, subset));
                if (found) return found;
            }
        }
    }

    return await tryKey(componentRegistryKey(name));
}

// Apply text overrides (the default-slot text) — finds the first descendant
// TEXT node whose name matches a known slot name OR is the only text node.
async function applyTextOverride(instance: InstanceNode, text: string): Promise<void>
{
    const textNodes = instance.findAllWithCriteria({ types: ["TEXT"] });
    if (textNodes.length === 0) return;

    // Prefer a text node named "label" (default convention from DESIGN.md slots).
    const named = textNodes.find((n) => n.name.toLowerCase() === "label");
    const target = named ?? textNodes[0]!;

    try
    {
        await figma.loadFontAsync(target.fontName as FontName);
        target.characters = text;
    }
    catch (err)
    {
        derr("create_instance", `text override failed: ${err instanceof Error ? err.message : String(err)}`);
    }
}

export const handler: OpHandler = {
    type: "create_instance",
    async execute(op, _nodeMap): Promise<number>
    {
        const opId = op.id ? String(op.id) : "(no-id)";
        const componentName = String(op.of ?? "");
        if (!componentName)
        {
            derr("create_instance", `"${opId}" → no \`of\` prop`);
            return 0;
        }

        const variants = (op.variants && typeof op.variants === "object")
            ? op.variants as Record<string, string>
            : undefined;

        const master = await resolveMaster(componentName, variants);
        if (!master)
        {
            derr("create_instance", `"${opId}" → master "${componentName}" NOT in registry. Available: [${[...componentRegistry.keys()].join(", ")}]`);
            return 0;
        }

        const instance = master.createInstance();
        const parent = resolveParent(op.frameId);
        parent.appendChild(instance);

        if (typeof op.name === "string" && op.name.trim().length > 0)
            instance.name = op.name;

        if (op.width !== undefined && op.height !== undefined)
            instance.resize(Number(op.width), Number(op.height));

        if (op.x !== undefined) instance.x = Number(op.x);
        if (op.y !== undefined) instance.y = Number(op.y);

        if (typeof op.opacity === "number") instance.opacity = op.opacity;

        if (typeof op.textOverride === "string" && op.textOverride.length > 0)
            await applyTextOverride(instance, op.textOverride);

        if (op.detach === true)
        {
            instance.detachInstance();
        }
        else if (op.id)
        {
            nodeMap.set(opId, instance.id);
            assignLogicalId(instance, op.id);
        }

        dlog("create_instance", `"${opId}" of "${componentName}" → ${describeNode(instance)}`);
        return 1;
    },
};
