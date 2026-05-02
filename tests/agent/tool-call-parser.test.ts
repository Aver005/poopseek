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

    it("parses bare tool json when the model leaves only a stray closing fence", async () =>
    {
        const text = await Bun.file("e:/Projects/Me/poopseek/session-2026-04-30T14-38-44-837Z-sp1tbo.md").text();
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
});
