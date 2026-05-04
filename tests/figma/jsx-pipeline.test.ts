import { describe, expect, it } from "vitest";
import { compileJsx } from "@/figma/engine/jsx/jsx-compiler";
import { parseJsx, JsxParseError } from "@/figma/engine/jsx/jsx-parser";
import { assertCompositionUsesKnownSymbols, expandCompositionToJsx, renderCompositionInvocationJsx } from "@/figma/engine/composition/materializer";
import { formatJsxValidationErrors, validateJsxFragment, validateJsxTree } from "@/figma/engine/jsx/jsx-validator";
import { setActiveTheme } from "@/figma/engine/theme/theme-state";
import { JsxBuffer } from "@/figma/engine/jsx/jsx-buffer";
import { VariableStore } from "@/figma/engine/theme/var-store";
import { TokensStore } from "@/figma/domain/artifacts/stores/tokens-store";
import { PrimitivePlanStore } from "@/figma/domain/artifacts/stores/primitive-plan-store";
import { PrimitiveJsxStore } from "@/figma/domain/artifacts/stores/primitive-jsx-store";
import { CompositionMetaStore } from "@/figma/domain/artifacts/stores/composition-meta-store";
import { CompositionJsxStore } from "@/figma/domain/artifacts/stores/composition-jsx-store";
import { CompileArtifactStore } from "@/figma/domain/artifacts/stores/compile-artifact-store";
import type { FigmaCompositionMetaArtifact, FigmaPrimitivesJsxArtifact } from "@/figma/domain/artifacts/artifact-types";

describe("figma JSX pipeline", () =>
{
    it("adds theme and color variable setup ops before node ops", () =>
    {
        setActiveTheme({
            name: "food-delivery",
            tokens: [
                { token: "canvas", hex: "#F8FAFC" },
                { token: "brand", hex: "#46A758" },
                { token: "text", hex: "#142033" },
                { token: "border", hex: "#E2E8F0" },
            ],
        });

        const ops = compileJsx(parseJsx(`<Screen className="bg-canvas"><Button label="Go" className="bg-brand text-on-brand" /></Screen>`));
        expect(ops[0]).toMatchObject({ type: "ensure_theme_variables", collection: "PoopSeek Theme" });
        expect(ops[1]).toMatchObject({ type: "ensure_color_variables", collection: "PoopSeek Colors" });
    });

    it("validates and compiles className-first JSX into variable-aware ops", () =>
    {
        const jsx = `
            <Screen name="Landing" className="bg-slate-50">
              <Frame x={24} y={48} className="flex flex-col gap-6">
                <Text className="text-4xl font-bold text-slate-900">Build faster</Text>
                <Button label="Generate" className="w-full bg-blue-500 text-white rounded-xl shadow-md" />
              </Frame>
            </Screen>
        `;

        const nodes = parseJsx(jsx);
        expect(validateJsxTree(nodes)).toEqual([]);

        const ops = compileJsx(nodes);
        expect(ops[0]).toMatchObject({
            type: "ensure_theme_variables",
            collection: "PoopSeek Theme",
        });
        expect(ops[1]).toMatchObject({
            type: "ensure_color_variables",
            collection: "PoopSeek Colors",
        });
        expect(ops.some((op) => op.type === "create_frame" && op.name === "Landing")).toBe(true);
        expect(ops.some((op) => op.type === "set_auto_layout" && op.direction === "VERTICAL")).toBe(true);

        const landing = ops.find((op) => op.type === "create_frame" && op.name === "Landing");
        expect(landing).toMatchObject({
            fill: {
                kind: "variable-color",
                variable: {
                    collection: "PoopSeek Colors",
                    name: "color/slate/50",
                },
            },
        });

        const button = ops.find((op) => op.type === "create_frame" && op.name === "Button / Generate");
        expect(button).toMatchObject({
            fillParent: true,
            fill: {
                kind: "variable-color",
                variable: {
                    name: "color/blue/500",
                },
            },
        });

        const buttonText = ops.find((op) => op.type === "create_text" && op.content === "Generate");
        expect(buttonText).toMatchObject({
            color: {
                kind: "variable-color",
                variable: {
                    name: "color/white",
                },
            },
        });
    });

    it("returns precise validation errors for unsupported utilities and missing props", () =>
    {
        const jsx = `
            <Screen>
              <Frame className="md:p-4">
                <Button className="bg-blue-500" />
              </Frame>
            </Screen>
        `;

        const errors = validateJsxTree(parseJsx(jsx));
        expect(errors.map((error) => error.message)).toEqual(expect.arrayContaining([
            expect.stringContaining('Unsupported class "md:p-4"'),
            expect.stringContaining("<Button> requires a non-empty label"),
        ]));

        const formatted = formatJsxValidationErrors(errors);
        expect(formatted).toContain("Unique issues");
        expect(formatted).toContain("fix: remove state/responsive modifiers entirely");
    });

    it("throws on mismatched closing tags", () =>
    {
        expect(() => parseJsx("<Screen><Frame></Screen>")).toThrow(JsxParseError);
    });

    it("accepts directional border, top radius, purple palette and sanitizes image src", () =>
    {
        const jsx = `
            <Screen className="bg-slate-50">
              <NavBar className="bg-white border-b border-slate-200" />
              <Card className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                <Image src=" \`https://example.com/image.png\` " className="w-full h-36 rounded-t-2xl" />
                <Frame className="bg-purple-100 rounded-full px-2 py-1">
                  <Text className="text-xs text-purple-700">-15%</Text>
                </Frame>
              </Card>
            </Screen>
        `;

        const nodes = parseJsx(jsx);
        expect(validateJsxTree(nodes)).toEqual([]);

        const ops = compileJsx(nodes);
        const image = ops.find((op) => op.type === "create_image");
        expect(image).toMatchObject({
            src: "https://example.com/image.png",
            cornerRadiusTopLeft: 16,
            cornerRadiusTopRight: 16,
        });

        expect(ops.some((op) => op.type === "create_line" && op.name === "Border Bottom")).toBe(true);
        expect(ops.some((op) =>
            op.type === "create_frame"
            && typeof op.fill === "object"
            && op.fill !== null
            && "variable" in op.fill
            && (op.fill as { variable: { name: string } }).variable.name === "color/purple/100")).toBe(true);
    });

    it("materializes staged composition from primitive JSX", () =>
    {
        const primitivesJsxArtifact: FigmaPrimitivesJsxArtifact = {
            id: "primitives_home_jsx_v1",
            type: "figma.primitives.jsx",
            version: 1,
            createdAt: Date.now(),
            primitivesArtifactId: "primitives_home_v1",
            entries: [
                {
                    name: "AppHeader",
                    jsxArtifactId: "jsx_app_header_v1",
                    jsx: "<HStack className=\"items-center justify-between\"><VStack className=\"gap-1\"><H2 className=\"text-text\">{title}</H2><BodySm className=\"text-muted\">{subtitle}</BodySm></VStack></HStack>",
                },
                {
                    name: "PromoCard",
                    jsxArtifactId: "jsx_promo_card_v1",
                    jsx: "<Card className=\"bg-brand rounded-3xl p-5 gap-3\"><H3 className=\"text-on-brand\">{title}</H3><BodySm className=\"text-on-brand\">{description}</BodySm><Button label=\"{cta}\" className=\"bg-white text-brand rounded-xl\" /></Card>",
                },
            ],
        };

        const compositionArtifact: FigmaCompositionMetaArtifact = {
            id: "compose_home_v1",
            type: "figma.compose.meta",
            version: 1,
            createdAt: Date.now(),
            screenName: "Home",
            tokensArtifactId: "tokens_food_delivery_v1",
            primitivesArtifactId: "primitives_home_v1",
            primitivesJsxArtifactId: primitivesJsxArtifact.id,
            jsxArtifactId: "compose_home_v1_jsx",
            compositionNodes: [
                {
                    kind: "element",
                    type: "Screen",
                    props: { name: "Home", className: "bg-canvas" },
                    children: [
                        {
                            kind: "element",
                            type: "VStack",
                            props: { className: "gap-6 p-6" },
                            children: [
                                { kind: "primitive", primitive: "AppHeader", props: { title: "Hello", subtitle: "What do you want today?" } },
                                { kind: "primitive", primitive: "PromoCard", props: { title: "Free delivery", description: "Today only", cta: "Order now" } },
                            ],
                        },
                    ],
                },
            ],
        };

        expect(() => assertCompositionUsesKnownSymbols(compositionArtifact, primitivesJsxArtifact)).not.toThrow();

        const invocationJsx = renderCompositionInvocationJsx(compositionArtifact);
        expect(invocationJsx).toContain("<AppHeader");
        expect(invocationJsx).toContain("<PromoCard");

        const expandedJsx = expandCompositionToJsx(compositionArtifact, primitivesJsxArtifact);
        expect(expandedJsx).toContain("<Screen");
        expect(expandedJsx).toContain("Free delivery");
        expect(expandedJsx).not.toContain("<AppHeader");

        const expandedNodes = parseJsx(expandedJsx);
        expect(validateJsxTree(expandedNodes)).toEqual([]);
        expect(validateJsxFragment(parseJsx(primitivesJsxArtifact.entries[0]!.jsx))).toEqual([]);

        const ops = compileJsx(expandedNodes);
        expect(ops.some((op) => op.type === "create_frame" && op.name === "Home")).toBe(true);
    });

    it.skip("supports staged tool runtime — v2 staged tools removed", async () =>
    {
        const buffer = new JsxBuffer();
        const varStore = new VariableStore();
        const tokensStore = new TokensStore();
        const primitivePlanStore = new PrimitivePlanStore();
        const primitiveJsxStore = new PrimitiveJsxStore();
        const compositionMetaStore = new CompositionMetaStore();
        const compositionJsxStore = new CompositionJsxStore();
        const compileArtifactStore = new CompileArtifactStore();
        const queuedOps: Array<Record<string, unknown>> = [];

        const tools = createStagedFigmaTools({
            buffer,
            varStore,
            tokensStore,
            primitivePlanStore,
            primitiveJsxStore,
            compositionMetaStore,
            compositionJsxStore,
            compileArtifactStore,
            enqueueOps: (ops) => queuedOps.push(...ops as Array<Record<string, unknown>>),
        });

        const tokensResult = await tools["figma.tokens"]!(
            {
                name: "food-delivery",
                collections: {
                    color: {
                        canvas: "#F8FAFC",
                        brand: "#46A758",
                        text: "#142033",
                        "text-muted": "#5B657A",
                    },
                },
            },
            {} as never,
        );
        expect(tokensResult.ok).toBe(true);
        const tokensArtifactId = (tokensResult.data as { id: string }).id;

        const listTokensResult = await tools["figma.tokens.list"]!({}, {} as never);
        expect(listTokensResult.ok).toBe(true);
        expect(Array.isArray(listTokensResult.data)).toBe(true);
        expect((listTokensResult.data as Array<{ id: string }>)[0]?.id).toBe(tokensArtifactId);

        const primitivesPlanResult = await tools["figma.primitives.plan"]!(
            {
                tokensArtifactId,
                entries: [
                    { name: "AppHeader", level: "molecule", props: ["title", "subtitle"] },
                ],
            },
            {} as never,
        );
        expect(primitivesPlanResult.ok).toBe(true);
        const primitivesArtifactId = (primitivesPlanResult.data as { id: string }).id;

        const primitivesJsxResult = await tools["figma.primitives.jsx"]!(
            {
                primitivesArtifactId,
                names: ["AppHeader"],
            },
            {
                currentToolCall: {
                    tool: "figma.primitives.jsx",
                    args: {
                        primitivesArtifactId,
                        names: ["AppHeader"],
                    },
                    attachments: [
                        {
                            kind: "jsx",
                            label: "AppHeader",
                            content: "<HStack className=\"items-center justify-between\"><VStack className=\"gap-1\"><H2 className=\"text-text\">{title}</H2><BodySm className=\"text-muted\">{subtitle}</BodySm></VStack></HStack>",
                        },
                    ],
                },
            } as never,
        );
        expect(primitivesJsxResult.ok).toBe(true);
        expect(primitivesJsxResult.output).toContain("```jsx");
        const primitivesJsxArtifactId = (primitivesJsxResult.data as { id: string }).id;

        const composeMetaResult = await tools["figma.compose.meta"]!(
            {
                tokensArtifactId,
                primitivesArtifactId,
                primitivesJsxArtifactId,
                screenName: "Home",
                compositionNodes: [
                    {
                        kind: "element",
                        type: "Screen",
                        props: { name: "Home", className: "bg-canvas" },
                        children: [
                            {
                                kind: "primitive",
                                primitive: "AppHeader",
                                props: { title: "Hello", subtitle: "What do you want today?" },
                            },
                        ],
                    },
                ],
            },
            {} as never,
        );
        expect(composeMetaResult.ok).toBe(true);
        const compositionArtifactId = (composeMetaResult.data as { id: string }).id;

        const renderResult = await tools.figma_render!(
            {
                compositionArtifactId,
                dispatch: true,
            },
            {} as never,
        );
        expect(renderResult.ok).toBe(true);
        expect(renderResult.output).toContain("```jsx");
        expect(queuedOps.length).toBeGreaterThan(0);

        const compileListResult = await tools["figma.compile.list"]!({}, {} as never);
        expect(compileListResult.ok).toBe(true);
        expect((compileListResult.data as Array<{ compositionArtifactId: string }>)[0]?.compositionArtifactId).toBe(compositionArtifactId);
    });

    it.skip("accepts primitive JSX from fenced jsx attachments — v2 staged tools removed", async () =>
    {
        const tools = createStagedFigmaTools({
            buffer: new JsxBuffer(),
            varStore: new VariableStore(),
            tokensStore: new TokensStore(),
            primitivePlanStore: new PrimitivePlanStore(),
            primitiveJsxStore: new PrimitiveJsxStore(),
            compositionMetaStore: new CompositionMetaStore(),
            compositionJsxStore: new CompositionJsxStore(),
            compileArtifactStore: new CompileArtifactStore(),
            enqueueOps: () => {},
        });

        const tokensResult = await tools["figma.tokens"]!(
            {
                name: "food-delivery",
                collections: {
                    color: {
                        canvas: "#F8FAFC",
                        text: "#142033",
                    },
                },
            },
            {} as never,
        );
        expect(tokensResult.ok).toBe(true);
        const tokensArtifactId = (tokensResult.data as { id: string }).id;

        const primitivesPlanResult = await tools["figma.primitives.plan"]!(
            {
                tokensArtifactId,
                entries: [{ name: "AppHeader", level: "molecule", props: ["title"] }],
            },
            {} as never,
        );
        expect(primitivesPlanResult.ok).toBe(true);
        const primitivesArtifactId = (primitivesPlanResult.data as { id: string }).id;

        const primitivesJsxResult = await tools["figma.primitives.jsx"]!(
            {
                primitivesArtifactId,
                names: ["AppHeader"],
            },
            {
                currentToolCall: {
                    tool: "figma.primitives.jsx",
                    args: {
                        primitivesArtifactId,
                        names: ["AppHeader"],
                    },
                    attachments: [
                        {
                            kind: "jsx",
                            label: "AppHeader",
                            content: "<HStack className=\"items-center\"><H2 className=\"text-text\">{title}</H2></HStack>",
                        },
                    ],
                },
            } as never,
        );

        expect(primitivesJsxResult.ok).toBe(true);
        expect(primitivesJsxResult.output).toContain("```jsx");
        expect((primitivesJsxResult.data as { entries: Array<{ name: string }> }).entries).toEqual([
            expect.objectContaining({ name: "AppHeader" }),
        ]);
    });

    it.skip("rejects inline primitive JSX inside JSON args — v2 staged tools removed", async () =>
    {
        const tools = createStagedFigmaTools({
            buffer: new JsxBuffer(),
            varStore: new VariableStore(),
            tokensStore: new TokensStore(),
            primitivePlanStore: new PrimitivePlanStore(),
            primitiveJsxStore: new PrimitiveJsxStore(),
            compositionMetaStore: new CompositionMetaStore(),
            compositionJsxStore: new CompositionJsxStore(),
            compileArtifactStore: new CompileArtifactStore(),
            enqueueOps: () => {},
        });

        const tokensResult = await tools["figma.tokens"]!(
            {
                collections: {
                    color: { canvas: "#FFFFFF", text: "#111111" },
                },
            },
            {} as never,
        );
        const tokensArtifactId = (tokensResult.data as { id: string }).id;

        const planResult = await tools["figma.primitives.plan"]!(
            {
                tokensArtifactId,
                entries: [{ name: "AppHeader", level: "molecule" }],
            },
            {} as never,
        );
        const primitivesArtifactId = (planResult.data as { id: string }).id;

        const primitivesJsxResult = await tools["figma.primitives.jsx"]!(
            {
                primitivesArtifactId,
                entries: [
                    {
                        name: "AppHeader",
                        jsx: "<HStack><H1>Bad</H1></HStack>",
                    },
                ],
            },
            {
                currentToolCall: {
                    tool: "figma.primitives.jsx",
                    args: {
                        primitivesArtifactId,
                        entries: [{ name: "AppHeader", jsx: "<HStack><H1>Bad</H1></HStack>" }],
                    },
                },
            } as never,
        );

        expect(primitivesJsxResult.ok).toBe(false);
        expect(primitivesJsxResult.output).toContain("Inline JSX in JSON is not allowed");
    });

    it.skip("merges isolated primitive jsx builds — v2 staged tools removed", async () =>
    {
        const tools = createStagedFigmaTools({
            buffer: new JsxBuffer(),
            varStore: new VariableStore(),
            tokensStore: new TokensStore(),
            primitivePlanStore: new PrimitivePlanStore(),
            primitiveJsxStore: new PrimitiveJsxStore(),
            compositionMetaStore: new CompositionMetaStore(),
            compositionJsxStore: new CompositionJsxStore(),
            compileArtifactStore: new CompileArtifactStore(),
            enqueueOps: () => {},
        });

        const tokensResult = await tools["figma.tokens"]!(
            {
                collections: {
                    color: { canvas: "#0A0A0A", text: "#FFFFFF" },
                },
            },
            {} as never,
        );
        const tokensArtifactId = (tokensResult.data as { id: string }).id;

        const planResult = await tools["figma.primitives.plan"]!(
            {
                tokensArtifactId,
                entries: [
                    { name: "HeroTitle", level: "atom" },
                    { name: "PrimaryButton", level: "molecule" },
                ],
            },
            {} as never,
        );
        const primitivesArtifactId = (planResult.data as { id: string }).id;

        const heroResult = await tools["figma.primitives.jsx"]!(
            {
                primitivesArtifactId,
                names: ["HeroTitle"],
            },
            {
                currentToolCall: {
                    tool: "figma.primitives.jsx",
                    args: { primitivesArtifactId, names: ["HeroTitle"] },
                    attachments: [
                        { kind: "jsx", label: "HeroTitle", content: "<H1 className=\"text-text text-4xl font-bold\">{title}</H1>" },
                    ],
                },
            } as never,
        );
        expect(heroResult.ok).toBe(true);

        const buttonResult = await tools["figma.primitives.jsx"]!(
            {
                primitivesArtifactId,
                names: ["PrimaryButton"],
            },
            {
                currentToolCall: {
                    tool: "figma.primitives.jsx",
                    args: { primitivesArtifactId, names: ["PrimaryButton"] },
                    attachments: [
                        { kind: "jsx", label: "PrimaryButton", content: "<Button className=\"bg-brand text-on-brand\">{label}</Button>" },
                    ],
                },
            } as never,
        );
        expect(buttonResult.ok).toBe(true);

        const latestArtifact = buttonResult.data as { entries: Array<{ name: string }> };
        expect(latestArtifact.entries.map((entry) => entry.name)).toEqual(["HeroTitle", "PrimaryButton"]);
    });

    it.skip("accepts nested token collections — v2 staged tools removed", async () =>
    {
        const tools = createStagedFigmaTools({
            buffer: new JsxBuffer(),
            varStore: new VariableStore(),
            tokensStore: new TokensStore(),
            primitivePlanStore: new PrimitivePlanStore(),
            primitiveJsxStore: new PrimitiveJsxStore(),
            compositionMetaStore: new CompositionMetaStore(),
            compositionJsxStore: new CompositionJsxStore(),
            compileArtifactStore: new CompileArtifactStore(),
            enqueueOps: () => {},
        });

        const tokensResult = await tools["figma.tokens"]!(
            {
                name: "shaurma-dark-theme",
                collections: {
                    color: {
                        background: {
                            page: "#0A0A0A",
                            surface: "#141414",
                        },
                        text: {
                            primary: "#FFFFFF",
                            secondary: "#A0A0A0",
                        },
                    },
                    spacing: {
                        4: "16px",
                        6: "24px",
                    },
                },
            },
            {} as never,
        );
        expect(tokensResult.ok).toBe(true);

        const tokensArtifact = tokensResult.data as { id: string; collections: { color: Record<string, string>; spacing: Record<string, number> } };
        expect(tokensArtifact.collections.color).toMatchObject({
            "background/page": "#0A0A0A",
            "background/surface": "#141414",
            "text/primary": "#FFFFFF",
        });
        expect(tokensArtifact.collections.spacing).toMatchObject({
            "4": 16,
            "6": 24,
        });

        const planResult = await tools["figma.primitives.plan"]!(
            {
                tokensArtifactId: tokensArtifact.id,
                entries: [
                    "Button",
                    { name: "ProductCard", description: "Product card with image and CTA" },
                    { name: "PromoBanner", description: "Hero promo section" },
                ],
            },
            {} as never,
        );
        expect(planResult.ok).toBe(true);

        const planArtifact = planResult.data as {
            entries: Array<{
                name: string;
                level: string;
                description?: string;
                props: unknown[];
                dependencies: unknown[];
            }>;
        };
        expect(planArtifact.entries).toEqual(expect.arrayContaining([
            expect.objectContaining({ name: "Button", level: "atom", props: [], dependencies: [] }),
            expect.objectContaining({ name: "ProductCard", level: "molecule", description: "Product card with image and CTA" }),
            expect.objectContaining({ name: "PromoBanner", level: "section", description: "Hero promo section" }),
        ]));
    });

    it.skip("rejects raw jsx in staged figma.compile — v2 staged tools removed", async () =>
    {
        const tools = createStagedFigmaTools({
            buffer: new JsxBuffer(),
            varStore: new VariableStore(),
            tokensStore: new TokensStore(),
            primitivePlanStore: new PrimitivePlanStore(),
            primitiveJsxStore: new PrimitiveJsxStore(),
            compositionMetaStore: new CompositionMetaStore(),
            compositionJsxStore: new CompositionJsxStore(),
            compileArtifactStore: new CompileArtifactStore(),
            enqueueOps: () => {},
        });

        const result = await tools["figma.compile"]!(
            {
                jsx: "<Screen name=\"Home\" />",
            },
            {} as never,
        );

        expect(result.ok).toBe(false);
        expect(result.output).toContain("does not accept raw jsx");
    });
});
