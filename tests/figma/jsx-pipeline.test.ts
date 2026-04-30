import { describe, expect, it } from "vitest";
import { compileJsx } from "@/figma/jsx-compiler";
import { parseJsx, JsxParseError } from "@/figma/jsx-parser";
import { formatJsxValidationErrors, validateJsxTree } from "@/figma/jsx-validator";
import { setActiveTheme } from "@/figma/theme-state";

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
});
