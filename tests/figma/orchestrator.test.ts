import { describe, expect, it } from "vitest";
import {
    applyRenderPolicyToOps,
    buildDerivedSnapshot,
    getStageConfig,
    inferEditIntent,
    inferLayoutConstraints,
    inferTaskMode,
} from "@/figma/orchestrator";
import { JsxBuffer } from "@/figma/jsx-buffer";
import type {
    FigmaCompileArtifact,
    FigmaCompositionJsxArtifact,
    FigmaCompositionMetaArtifact,
    FigmaPrimitivesJsxArtifact,
    FigmaPrimitivesPlanArtifact,
    FigmaTokensArtifact,
} from "@/figma/artifact-types";

describe("figma orchestrator", () =>
{
    it("defaults to revision mode after first presented result", () =>
    {
        expect(inferTaskMode(false)).toBe("initial");
        expect(inferTaskMode(true)).toBe("revision");
    });

    it("infers edit intent conservatively", () =>
    {
        expect(inferEditIntent("Сделай новый экран профиля", true)).toBe("new-screen");
        expect(inferEditIntent("Покажи альтернативный вариант hero", true)).toBe("fork-variant");
        expect(inferEditIntent("Сделай кнопку заметнее и уменьши отступы", true)).toBe("edit-existing");
    });

    it("applies sensible layout defaults", () =>
    {
        expect(inferLayoutConstraints("Нарисуй мобильный checkout")).toMatchObject({
            platform: "mobile",
            viewportWidth: 390,
            maxContentWidth: 390,
        });

        expect(inferLayoutConstraints("Собери desktop dashboard")).toMatchObject({
            platform: "desktop",
            viewportWidth: 1440,
            maxContentWidth: 1200,
        });
    });

    it("replaces current screen during revision edit-existing dispatch", () =>
    {
        const result = applyRenderPolicyToOps(
            [{ type: "create_frame", id: "screen_home_v2", name: "Home" }],
            {
                taskMode: "revision",
                editIntent: "edit-existing",
                activeRootNodeId: "screen_home_v1",
            },
        );

        expect(result.nextRootNodeId).toBe("screen_home_v2");
        expect(result.ops[0]).toMatchObject({ type: "delete_node", nodeId: "screen_home_v1" });
        expect(result.ops[1]).toMatchObject({ type: "create_frame", id: "screen_home_v2" });
    });

    it("builds snapshot from latest artifacts", () =>
    {
        const tokens: FigmaTokensArtifact = {
            id: "tokens_food_v1",
            type: "figma.tokens",
            version: 1,
            createdAt: Date.now(),
            themeName: "food",
            modes: ["light"],
            collections: { color: { canvas: "#fff" }, spacing: {}, radius: {}, typography: {}, shadow: {} },
            aliases: {},
        };

        const primitivePlan: FigmaPrimitivesPlanArtifact = {
            id: "primitives_home_v1",
            type: "figma.primitives.plan",
            version: 1,
            createdAt: Date.now(),
            tokensArtifactId: tokens.id,
            entries: [],
        };

        const primitiveJsx: FigmaPrimitivesJsxArtifact = {
            id: "primitives_home_jsx_v1",
            type: "figma.primitives.jsx",
            version: 1,
            createdAt: Date.now(),
            primitivesArtifactId: primitivePlan.id,
            entries: [],
        };

        const compositionMeta: FigmaCompositionMetaArtifact = {
            id: "compose_home_v1",
            type: "figma.compose.meta",
            version: 1,
            createdAt: Date.now(),
            screenName: "Home",
            tokensArtifactId: tokens.id,
            primitivesArtifactId: primitivePlan.id,
            primitivesJsxArtifactId: primitiveJsx.id,
            compositionNodes: [],
            jsxArtifactId: "compose_home_jsx",
        };

        const compositionJsx: FigmaCompositionJsxArtifact = {
            id: "compose_home_jsx_v1",
            type: "figma.compose.jsx",
            version: 1,
            createdAt: Date.now(),
            compositionArtifactId: compositionMeta.id,
            jsxArtifactId: "compose_home_jsx",
            jsx: "<Screen name=\"Home\" />",
        };

        const compileArtifact: FigmaCompileArtifact = {
            id: "compile_home_v1",
            type: "figma.compile",
            version: 1,
            createdAt: Date.now(),
            compositionArtifactId: compositionMeta.id,
            expandedJsxArtifactId: "compile_home_expanded",
            expandedJsx: "<Screen name=\"Home\"><Text>Ready</Text></Screen>",
            opCount: 1,
            dispatched: true,
        };

        const snapshot = buildDerivedSnapshot(
            {
                buffer: new JsxBuffer(),
                tokens: [tokens],
                primitivePlans: [primitivePlan],
                primitiveJsx: [primitiveJsx],
                compositionMeta: [compositionMeta],
                compositionJsx: [compositionJsx],
                compileArtifacts: [compileArtifact],
            },
            {
                taskMode: "revision",
                editIntent: "edit-existing",
                currentStage: "revision",
                hasPresentedResult: true,
                revisionCount: 1,
                lastUserPrompt: "Сделай лучше",
                activeRootNodeId: "screen_home_v1",
                activeCompositionArtifactId: compositionMeta.id,
                activeCompileArtifactId: compileArtifact.id,
                layout: inferLayoutConstraints("mobile"),
            },
        );

        expect(snapshot.source).toBe("artifacts");
        expect(snapshot.invocationJsx).toContain("<Screen");
        expect(snapshot.expandedJsx).toContain("Ready");
        expect(snapshot.activeCompositionArtifactId).toBe(compositionMeta.id);
    });

    it("prefers plugin snapshot over derived artifacts when available", () =>
    {
        const snapshot = buildDerivedSnapshot(
            {
                buffer: new JsxBuffer(),
                tokens: [],
                primitivePlans: [],
                primitiveJsx: [],
                compositionMeta: [],
                compositionJsx: [],
                compileArtifacts: [],
            },
            {
                taskMode: "revision",
                editIntent: "edit-existing",
                currentStage: "revision",
                hasPresentedResult: true,
                revisionCount: 2,
                lastUserPrompt: "Подвинь карточку",
                activeRootNodeId: "screen_live_v1",
                layout: inferLayoutConstraints("mobile"),
                pluginSnapshot: {
                    source: "plugin",
                    receivedAt: Date.now(),
                    nodeCount: 1,
                    selectedNodeIds: ["screen_live_v1"],
                    tree: [{ id: "screen_live_v1", type: "FRAME", name: "Home" }],
                    jsx: "<Screen name=\"Home\" />",
                },
            },
        );

        expect(snapshot.source).toBe("plugin");
        expect(snapshot.invocationJsx).toBe("<Screen name=\"Home\" />");
        expect(snapshot.summary).toContain("snapshot source: plugin");
    });

    it("limits stage tools for compose stage", () =>
    {
        const config = getStageConfig("compose", "initial");
        expect(config.allowedTools).toContain("figma.compose.meta");
        expect(config.allowedTools).toContain("figma.compile");
        expect(config.requiredTools).toEqual(["figma.compose.meta", "figma.compile"]);
    });
});
