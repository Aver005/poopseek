import type { OpHandler } from "./types";
import { resolveNode, bindNumberVariable } from "../helpers";
import { dlog, derr, describeNode } from "../debug";

function vstr(v: unknown): string | undefined { return typeof v === "string" ? v : undefined; }

export const handler: OpHandler = {
    type: "set_auto_layout",
    async execute(op, nodeMap): Promise<number> {
        const node = resolveNode(op.nodeId, nodeMap);
        if (!node)
        {
            derr("set_auto_layout", `❌ nodeId="${op.nodeId}" did not resolve to any node — op skipped`);
            return 0;
        }
        // FRAME / COMPONENT / COMPONENT_SET all extend DefaultFrameMixin
        // and share the same auto-layout API (layoutMode, itemSpacing,
        // padding*, primaryAxisAlignItems, etc.). Accept all three.
        const supportsAutoLayout = node.type === "FRAME"
            || node.type === "COMPONENT"
            || node.type === "COMPONENT_SET";
        if (!supportsAutoLayout)
        {
            derr("set_auto_layout", `❌ nodeId="${op.nodeId}" resolved to type=${node.type} — op skipped (FRAME/COMPONENT/COMPONENT_SET only)`);
            return 0;
        }

        const frame = node as FrameNode;
        const direction = op.direction
            ? String(op.direction) as "HORIZONTAL" | "VERTICAL" | "NONE"
            : frame.layoutMode;
        if (op.direction) frame.layoutMode = direction;

        const isVertical = direction === "VERTICAL";
        type SizingMode = "FIXED" | "HUG" | "FILL";
        const f = frame as FrameNode & {
            layoutSizingHorizontal: SizingMode;
            layoutSizingVertical: SizingMode;
        };

        let canFill = true;
        const willSetFill = !!op.fillParent || !!op.fillParentHeight;
        if (willSetFill)
        {
            const parent = frame.parent;
            const parentLM = parent && "layoutMode" in parent
                ? (parent as BaseNode & { layoutMode: string }).layoutMode
                : "n/a";
            canFill = parentLM === "HORIZONTAL" || parentLM === "VERTICAL";
            if (!canFill)
            {
                derr("set_auto_layout",
                    `❌ FILL requested but parent is NOT auto-layout — falling back to FIXED to avoid throwing`,
                    `  node=${describeNode(frame)}`,
                    `  parent=${describeNode(parent)}`,
                    `  op.fillParent=${op.fillParent ?? false} op.fillParentHeight=${op.fillParentHeight ?? false}`);
            }
            else
            {
                dlog("set_auto_layout",
                    `setting FILL on ${describeNode(frame)} (direction=${direction}, parent layoutMode=${parentLM}) fillParent=${op.fillParent ?? false} fillParentHeight=${op.fillParentHeight ?? false}`);
            }
        }
        else
        {
            dlog("set_auto_layout",
                `${describeNode(frame)} direction=${direction} hugMain=${op.hugMain ?? false} hugCross=${op.hugCross ?? false}`);
        }

        const safeFillH = canFill && op.fillParent;
        const safeFillV = canFill && op.fillParentHeight;
        if (isVertical) {
            f.layoutSizingVertical = op.hugMain ? "HUG" : (safeFillV ? "FILL" : "FIXED");
            f.layoutSizingHorizontal = safeFillH ? "FILL" : "FIXED";
        } else {
            f.layoutSizingHorizontal = safeFillH ? "FILL" : (op.hugMain ? "HUG" : "FIXED");
            f.layoutSizingVertical = safeFillV ? "FILL" : (op.hugCross ? "HUG" : "FIXED");
        }

        if (op.gap !== undefined) frame.itemSpacing = Number(op.gap);
        await bindNumberVariable(frame, "itemSpacing", vstr(op.gapVariableName), "set_auto_layout");

        if (op.paddingH !== undefined) {
            frame.paddingLeft = Number(op.paddingH);
            frame.paddingRight = Number(op.paddingH);
            const v = vstr(op.paddingHVariableName);
            await bindNumberVariable(frame, "paddingLeft",  v, "set_auto_layout");
            await bindNumberVariable(frame, "paddingRight", v, "set_auto_layout");
        }
        if (op.paddingV !== undefined) {
            frame.paddingTop = Number(op.paddingV);
            frame.paddingBottom = Number(op.paddingV);
            const v = vstr(op.paddingVVariableName);
            await bindNumberVariable(frame, "paddingTop",    v, "set_auto_layout");
            await bindNumberVariable(frame, "paddingBottom", v, "set_auto_layout");
        }
        if (op.paddingLeft !== undefined) {
            frame.paddingLeft = Number(op.paddingLeft);
            await bindNumberVariable(frame, "paddingLeft", vstr(op.paddingLeftVariableName), "set_auto_layout");
        }
        if (op.paddingRight !== undefined) {
            frame.paddingRight = Number(op.paddingRight);
            await bindNumberVariable(frame, "paddingRight", vstr(op.paddingRightVariableName), "set_auto_layout");
        }
        if (op.paddingTop !== undefined) {
            frame.paddingTop = Number(op.paddingTop);
            await bindNumberVariable(frame, "paddingTop", vstr(op.paddingTopVariableName), "set_auto_layout");
        }
        if (op.paddingBottom !== undefined) {
            frame.paddingBottom = Number(op.paddingBottom);
            await bindNumberVariable(frame, "paddingBottom", vstr(op.paddingBottomVariableName), "set_auto_layout");
        }
        if (op.align) frame.primaryAxisAlignItems = String(op.align) as "MIN" | "MAX" | "CENTER" | "SPACE_BETWEEN";
        if (op.counterAlign) frame.counterAxisAlignItems = String(op.counterAlign) as "MIN" | "MAX" | "CENTER" | "BASELINE";
        if (op.wrap !== undefined) frame.layoutWrap = op.wrap ? "WRAP" : "NO_WRAP";

        return 1;
    },
};
