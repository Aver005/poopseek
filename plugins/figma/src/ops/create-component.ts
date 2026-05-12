import type { OpHandler } from "./types";
import { nodeMap, componentRegistry } from "../cache";
import {
    applyLayoutSizing,
    applyCornerRadii,
    solidPaintWithBinding,
    bindNumberVariable,
    componentRegistryKey,
    ensureUiKitPage,
    resolveParent,
    assignLogicalId,
} from "../helpers";
import { dlog, derr, describeNode } from "../debug";

function vstr(v: unknown): string | undefined { return typeof v === "string" ? v : undefined; }

export const handler: OpHandler = {
    type: "create_component",
    async execute(op, _nodeMap): Promise<number>
    {
        const opId = op.id ? String(op.id) : "(no-id)";
        const componentName = String(op.name ?? "Component");
        const variants = (op.variants && typeof op.variants === "object")
            ? op.variants as Record<string, string>
            : undefined;
        const regKey = componentRegistryKey(componentName, variants);

        let component: ComponentNode | null = null;

        // Reuse existing master if registry already has it AND it's still
        // valid (in nodeMap from THIS batch). After clear_canvas the
        // registry is wiped; but mid-batch we may legitimately re-emit a
        // create_component for the same key (rare). Note: we explicitly
        // skip reuse if the registered node id equals one we're about to
        // re-resolve elsewhere, to avoid the "Chip's state=default reuses
        // Input's state=default" collision (now fixed by name inheritance).
        const cached = componentRegistry.get(regKey);
        if (cached)
        {
            const existing = await figma.getNodeByIdAsync(cached);
            if (existing && existing.type === "COMPONENT")
            {
                component = existing as ComponentNode;
                dlog("create_component", `"${regKey}" → REUSE registered → ${describeNode(component)}`);
            }
        }

        if (!component)
        {
            // Determine where to place the master. Priority:
            //  1. op.frameId resolves to a ComponentSet/Frame on UI Kit page → place inside it
            //     (gives the visual grouping the user expects when ComponentSet wraps variants)
            //  2. fallback to UI Kit page directly (single-master, no variant grouping)
            let parent: BaseNode & ChildrenMixin = await ensureUiKitPage();
            if (typeof op.frameId === "string")
            {
                const resolved = resolveParent(op.frameId);
                if (resolved && resolved.type !== "PAGE" && "appendChild" in resolved)
                    parent = resolved as BaseNode & ChildrenMixin;
            }

            component = figma.createComponent();
            parent.appendChild(component);
            componentRegistry.set(regKey, component.id);
            // Register the FIRST variant as the bare-name fallback so
            // `<Instance of="Button">` (no variant attrs) resolves to a
            // sensible default master. Only set if not already present —
            // earlier in the batch the create_component_set may have
            // registered a placeholder Frame here, but that's not a
            // valid Component master so we always overwrite when this is
            // the first real Component for this name.
            const bareKey = componentRegistryKey(componentName);
            if (bareKey !== regKey)
            {
                const existingBare = componentRegistry.get(bareKey);
                if (!existingBare)
                {
                    componentRegistry.set(bareKey, component.id);
                }
                else
                {
                    // Replace placeholder Frame entry with this real Component.
                    const existingNode = await figma.getNodeByIdAsync(existingBare);
                    if (!existingNode || existingNode.type !== "COMPONENT")
                        componentRegistry.set(bareKey, component.id);
                }
            }
            if (op.id) nodeMap.set(opId, component.id);
            dlog("create_component", `"${regKey}" → NEW under ${describeNode(parent)} → ${describeNode(component)}`);
        }

        // Component name in Figma uses slash for variant grouping ("Button/state=hover,size=md")
        // — Figma's Assets panel groups slash-separated names automatically.
        component.name = regKey;
        assignLogicalId(component, op.id);

        component.resize(Number(op.width ?? 100), Number(op.height ?? 100));
        if (typeof op.fill === "string")
        {
            const paint = await solidPaintWithBinding(op.fill, vstr(op.fillVariableName));
            component.fills = paint ? [paint] : [];
        }
        if (op.cornerRadius !== undefined) component.cornerRadius = Number(op.cornerRadius);
        await bindNumberVariable(component, "topLeftRadius",     vstr(op.cornerRadiusVariableName ?? op.cornerRadiusTopLeftVariableName), "create_component");
        await bindNumberVariable(component, "topRightRadius",    vstr(op.cornerRadiusVariableName ?? op.cornerRadiusTopRightVariableName), "create_component");
        await bindNumberVariable(component, "bottomLeftRadius",  vstr(op.cornerRadiusVariableName ?? op.cornerRadiusBottomLeftVariableName), "create_component");
        await bindNumberVariable(component, "bottomRightRadius", vstr(op.cornerRadiusVariableName ?? op.cornerRadiusBottomRightVariableName), "create_component");
        applyCornerRadii(component, op);
        if (op.clipContent !== undefined) component.clipsContent = Boolean(op.clipContent);
        applyLayoutSizing(component, op);

        if (op.id) nodeMap.set(opId, component.id);
        return 1;
    },
};
