import type { ToolCallEnvelope } from "./types";
import { parseMessage, tryParseEnvelope } from "./tool-call-parser";

export interface StreamingToolParserOptions {
  maxTools?: number;
}

export interface ParsedToolEvent {
  type: "tool";
  preText: string;
  envelope: ToolCallEnvelope;
}

export interface ToolParseWarning {
  content: string;
}

export class StreamingToolParser {
  private buffer = "";
  private lastProcessedLength = 0;
  private pendingTools: ParsedToolEvent[] = [];
  private warnings: ToolParseWarning[] = [];
  private maxTools: number;

  constructor(options: StreamingToolParserOptions = {}) {
    this.maxTools = options.maxTools ?? 10;
  }

  feed(chunk: string): ParsedToolEvent[] {
    this.buffer += chunk;

    const completedTools: ParsedToolEvent[] = [];

    const fencedRegex = /```([A-Za-z0-9_-]*)\s*\r?\n?([\s\S]*?)\s*```/g;
    fencedRegex.lastIndex = this.lastProcessedLength;

    let match;
    while ((match = fencedRegex.exec(this.buffer)) !== null) {
      if (completedTools.length >= this.maxTools) break;

      const language = match[1]?.trim().toLowerCase() ?? "";
      if (language === "yaml" || language === "yml") continue;

      const content = match[2]?.trim();
      if (!content) continue;

      const envelope = tryParseEnvelope(content);
      if (!envelope) {
        if (/["']?tool["']?\s*:/.test(content)) {
          this.warnings.push({ content });
        }
        continue;
      }

      const start = match.index ?? 0;
      const preText = this.buffer.slice(this.lastProcessedLength, start).trim();

      completedTools.push({ type: "tool", preText, envelope });
      this.lastProcessedLength = start + match[0].length;
    }

    if (completedTools.length > 0) {
      this.pendingTools.push(...completedTools);
    }

    return completedTools;
  }

  finalize(): ParsedToolEvent[] {
    const remaining = this.buffer.slice(this.lastProcessedLength);
    if (remaining.trim().length === 0) {
      return [];
    }

    const fallbackResult = parseMessage(remaining, this.maxTools - this.pendingTools.length);
    const finalTools: ParsedToolEvent[] = fallbackResult.toolCalls.map(tc => ({
      type: "tool",
      preText: tc.preText,
      envelope: tc.envelope
    }));

    if (finalTools.length === 0 && /["']?tool["']?\s*:/.test(remaining)) {
      this.warnings.push({ content: remaining.trim().slice(0, 500) });
    }

    return finalTools;
  }

  getWarnings(): ToolParseWarning[] {
    return [...this.warnings];
  }

  getCompletedTools(): ParsedToolEvent[] {
    return [...this.pendingTools];
  }

  reset(): void {
    this.buffer = "";
    this.lastProcessedLength = 0;
    this.pendingTools = [];
    this.warnings = [];
  }
}
