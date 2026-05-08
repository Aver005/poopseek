import type { OpHandler } from "./types";
import { resolveNode } from "../helpers";
import { dlog, derr, describeNode } from "../debug";

export const handler: OpHandler = {
    type: "set_auto_layout",
    async execute(op, nodeMap): Promise<number> {
        const node = resolveNode(op.nodeId, nodeMap);
        if (!node)
        {
            derr("set_auto_layout", `❌ nodeId="${op.nodeId}" did not resolve to any node — op skipped`);
            return 0;
        }
        if (node.type !== "FRAME")
        {
            derr("set_auto_layout", `❌ nodeId="${op.nodeId}" resolved to type=${node.type}, not FRAME — op skipped`);
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
        if (op.paddingH !== undefined) {
            frame.paddingLeft = Number(op.paddingH);
            frame.paddingRight = Number(op.paddingH);
        }
        if (op.paddingV !== undefined) {
            frame.paddingTop = Number(op.paddingV);
            frame.paddingBottom = Number(op.paddingV);
        }
        if (op.paddingLeft !== undefined) frame.paddingLeft = Number(op.paddingLeft);
        if (op.paddingRight !== undefined) frame.paddingRight = Number(op.paddingRight);
        if (op.paddingTop !== undefined) frame.paddingTop = Number(op.paddingTop);
        if (op.paddingBottom !== undefined) frame.paddingBottom = Number(op.paddingBottom);
        if (op.align) frame.primaryAxisAlignItems = String(op.align) as "MIN" | "MAX" | "CENTER" | "SPACE_BETWEEN";
        if (op.counterAlign) frame.counterAxisAlignItems = String(op.counterAlign) as "MIN" | "MAX" | "CENTER" | "BASELINE";
        if (op.wrap !== undefined) frame.layoutWrap = op.wrap ? "WRAP" : "NO_WRAP";

        return 1;
    },
};
