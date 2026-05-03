import { describe, expect, it } from "vitest";
import { parseMessage } from "@/agent/tool-call-parser";
import { StreamingToolParser } from "@/agent/streaming-tool-parser";

describe("tool-call parser", () =>
{
    it("parses multiple fenced json tool-calls in one message", () =>
    {
        const message = [
            "```json",
            "{\"tool\":\"figma_render\",\"args\":{\"jsx\":\"<Screen name=\\\"Home\\\"></Screen>\"}}",
            "```",
            "",
            "Первый экран готов, делаю второй.",
            "",
            "```json",
            "{\"tool\":\"figma_render\",\"args\":{\"jsx\":\"<Screen name=\\\"Menu\\\"></Screen>\"}}",
            "```",
        ].join("\n");

        const result = parseMessage(message);
        expect(result.toolCalls).toHaveLength(2);
        expect(result.toolCalls[0]?.envelope.tool).toBe("figma_render");
        expect(result.toolCalls[1]?.envelope.tool).toBe("figma_render");
    });

    it("parses multiple fenced json tool-calls from streaming chunks", () =>
    {
        const parser = new StreamingToolParser();
        const first = parser.feed("```json\n{\"tool\":\"figma_render\",\"args\":{\"jsx\":\"<Screen name=\\\"Home\\\"></Screen>\"}}\n```\n");
        const second = parser.feed("```json\n{\"tool\":\"figma_render\",\"args\":{\"jsx\":\"<Screen name=\\\"Restaurant\\\"></Screen>\"}}\n```");
        const final = parser.finalize();

        const events = [...first, ...second, ...final];
        expect(events).toHaveLength(2);
        expect(events[0]?.envelope.tool).toBe("figma_render");
        expect(events[1]?.envelope.tool).toBe("figma_render");
    });

    it("parses bare tool json when the model leaves only a stray closing fence", () =>
    {
        const text = [
            "```",
            "{\"tool\":\"figma_define_theme\",\"args\":{\"name\":\"dark\",\"tokens\":[{\"token\":\"canvas\",\"hex\":\"#000000\"}]}}",
            "```",
            "```",
        ].join("\n");
        const parser = new StreamingToolParser();
        const events = [...parser.feed(text), ...parser.finalize()];

        expect(events).toHaveLength(1);
        expect(events[0]?.envelope.tool).toBe("figma_define_theme");
    });

    it("parses dotted staged tool names", () =>
    {
        const message = [
            "```json",
            "{\"tool\":\"figma.compose.jsx\",\"args\":{\"compositionArtifactId\":\"compose_home_v1\"}}",
            "```",
        ].join("\n");

        const result = parseMessage(message);
        expect(result.toolCalls).toHaveLength(1);
        expect(result.toolCalls[0]?.envelope.tool).toBe("figma.compose.jsx");
    });

    it("attaches fenced jsx blocks to figma.primitives.jsx tool calls", () =>
    {
        const message = [
            "```json",
            "{\"tool\":\"figma.primitives.jsx\",\"args\":{\"primitivesArtifactId\":\"primitives_home_v1\",\"names\":[\"AppHeader\",\"SearchField\"]}}",
            "```",
            "",
            "AppHeader",
            "```jsx",
            "<HStack><Text>{title}</Text></HStack>",
            "```",
            "",
            "SearchField",
            "```jsx",
            "<Input placeholder=\"{placeholder}\" />",
            "```",
        ].join("\n");

        const result = parseMessage(message);
        expect(result.toolCalls).toHaveLength(1);
        expect(result.toolCalls[0]?.envelope.tool).toBe("figma.primitives.jsx");
        expect(result.toolCalls[0]?.envelope.attachments).toEqual([
            { kind: "jsx", label: "AppHeader", content: "<HStack><Text>{title}</Text></HStack>" },
            { kind: "jsx", label: "SearchField", content: "<Input placeholder=\"{placeholder}\" />" },
        ]);
    });

    it("waits for fenced jsx attachments in streaming mode", () =>
    {
        const parser = new StreamingToolParser();
        const first = parser.feed([
            "```json",
            "{\"tool\":\"figma.primitives.jsx\",\"args\":{\"primitivesArtifactId\":\"primitives_home_v1\",\"names\":[\"AppHeader\"]}}",
            "```",
        ].join("\n"));
        const second = parser.feed([
            "",
            "AppHeader",
            "```jsx",
            "<HStack><Text>{title}</Text></HStack>",
            "```",
        ].join("\n"));
        const final = parser.finalize();

        expect(first).toHaveLength(0);
        expect(second).toHaveLength(0);
        expect(final).toHaveLength(1);
        expect(final[0]?.envelope.attachments).toEqual([
            { kind: "jsx", label: "AppHeader", content: "<HStack><Text>{title}</Text></HStack>" },
        ]);
    });

    it("does not treat inline primitives JSX JSON as attachment-complete", () =>
    {
        const parser = new StreamingToolParser();
        const events = [
            ...parser.feed([
                "```json",
                "{\"tool\":\"figma.primitives.jsx\",\"args\":{\"primitivesArtifactId\":\"primitives_home_v1\",\"entries\":[{\"name\":\"AppHeader\",\"jsx\":\"<HStack><Text>{title}</Text></HStack>\"}]}}",
                "```",
            ].join("\n")),
            ...parser.finalize(),
        ];

        expect(events).toHaveLength(0);
    });
});
