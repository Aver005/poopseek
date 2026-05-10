import type { OpHandler } from "./types";
import { nodeMap, componentRegistry } from "../cache";
import { ensureUiKitPage, applyLayoutSizing, componentRegistryKey } from "../helpers";
import { dlog, describeNode } from "../debug";

// v1 strategy: <ComponentSet> compiles to a regular FRAME on the UI Kit
// page, which acts as a layout container for child <Component> masters.
// We do NOT call figma.combineAsVariants() here — that would require all
// variants to exist first AND a separate post-pass. Instead we register
// the bare name "Button" → this frame's id so `<Instance of="Button">`
// without variants resolves to it (best-effort fallback). Instances WITH
// variant attrs use the per-variant entries written by create_component.
export const handler: OpHandler = {
    type: "create_component_set",
    async execute(op, _nodeMap): Promise<number>
    {
        const opId = op.id ? String(op.id) : "(no-id)";
        const setName = String(op.name ?? "ComponentSet");

        const uiKit = await ensureUiKitPage();
        const frame = figma.createFrame();
        uiKit.appendChild(frame);
        frame.name = setName;
        frame.resize(Number(op.width ?? 200), Number(op.height ?? 200));
        applyLayoutSizing(frame, op);

        if (op.id) nodeMap.set(opId, frame.id);
        // Register the bare name so plain `<Instance of="Button">` (no
        // variants) finds something. Per-variant entries override this in
        // `create_instance` lookup priority.
        componentRegistry.set(componentRegistryKey(setName), frame.id);

        dlog("create_component_set", `"${setName}" → ${describeNode(frame)}`);
        return 1;
    },
};
