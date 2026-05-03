import { describe, expect, it } from "vitest";
import { planPatchExistingRoot } from "@/figma/domain/plugin/patch-planner";
import type { FigmaPluginSnapshot } from "@/figma/domain/plugin/snapshot-types";
import type { FigmaOp } from "@/figma/api/contracts";

describe("figma patch planner", () =>
{
    it("reuses existing root frame and remaps children to it", () =>
    {
        const snapshot: FigmaPluginSnapshot = {
            source: "plugin",
            receivedAt: Date.now(),
            nodeCount: 3,
            selectedNodeIds: ["screen_live"],
            tree: [{
                id: "screen_live",
                type: "FRAME",
                name: "Home",
                width: 390,
                height: 844,
                children: [
                    { id: "old_header", type: "FRAME", name: "Header" },
                    { id: "old_body", type: "FRAME", name: "Body" },
                ],
            }],
            jsx: "<Screen name=\"Home\" />",
        };

        const ops: FigmaOp[] = [
            { type: "create_frame", id: "screen_next", name: "Home Updated", width: 430, height: 932, fill: "#FFFFFF" },
            { type: "set_auto_layout", nodeId: "screen_next", direction: "VERTICAL", gap: 16, paddingH: 24, paddingV: 24 },
            { type: "create_frame", id: "hero_section", frameId: "screen_next", name: "Hero", width: 390, height: 220 },
        ];

        const result = planPatchExistingRoot({
            ops,
            activeRootNodeId: "screen_live",
            pluginSnapshot: snapshot,
        });

        expect(result.mode).toBe("patched-root");
        expect(result.reusedRootNodeId).toBe("screen_live");
        expect(result.ops[0]).toMatchObject({ type: "rename_node", nodeId: "screen_live", name: "Home Updated" });
        expect(result.ops[1]).toMatchObject({ type: "resize_node", nodeId: "screen_live", width: 430, height: 932 });
        expect(result.ops).toContainEqual({ type: "delete_node", nodeId: "old_header" });
        expect(result.ops).toContainEqual({ type: "delete_node", nodeId: "old_body" });
        expect(result.ops).toContainEqual({ type: "set_auto_layout", nodeId: "screen_live", direction: "VERTICAL", gap: 16, paddingH: 24, paddingV: 24 });
        expect(result.ops).toContainEqual({ type: "create_frame", id: "hero_section", frameId: "screen_live", name: "Hero", width: 390, height: 220 });
    });

    it("falls back when plugin snapshot is unavailable", () =>
    {
        const ops: FigmaOp[] = [
            { type: "create_frame", id: "screen_next", name: "Home Updated", width: 430, height: 932 },
        ];

        const result = planPatchExistingRoot({ ops });

        expect(result.mode).toBe("fallback");
        expect(result.ops).toEqual(ops);
    });
});
