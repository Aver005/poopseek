import type { ToolCallEnvelope } from "./types";
import { parseMessage } from "./tool-call-parser";

export interface StreamingToolParserOptions {
  maxTools?: number;
}

export interface ParsedToolEvent {
  type: "tool";
  preText: string;
  envelope: ToolCallEnvelope;
}

export class StreamingToolParser {
  private buffer = "";
  private lastProcessedLength = 0;
  private pendingTools: ParsedToolEvent[] = [];
  private maxTools: number;

  constructor(options: StreamingToolParserOptions = {}) {
    this.maxTools = options.maxTools ?? 10;
  }

  /**
   * Добавить новый текстовый чанк и вернуть завершённые инструменты
   */
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

      const envelope = this.tryParseCompleteJson(content);
      if (!envelope) continue;

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

  /**
   * Завершить парсинг — вернуть всё, что осталось
   */
  finalize(): ParsedToolEvent[] {
    // Пытаемся спарсить незавершённые блоки через fallback
    const remaining = this.buffer.slice(this.lastProcessedLength);
    if (remaining.trim().length === 0) {
      return [];
    }
    
    // Fallback: ищем незавершённые JSON
    const fallbackResult = parseMessage(remaining, this.maxTools - this.pendingTools.length);
    const finalTools: ParsedToolEvent[] = fallbackResult.toolCalls.map(tc => ({
      type: "tool",
      preText: tc.preText,
      envelope: tc.envelope
    }));
    
    return finalTools;
  }

  private tryParseCompleteJson(content: string): ToolCallEnvelope | null {
    try {
      const parsed = JSON.parse(content);
      if (typeof parsed.tool !== "string" || parsed.tool.length === 0) return null;
      const args = typeof parsed.args === "object" && parsed.args !== null ? parsed.args : {};
      return { tool: parsed.tool, args };
    } catch {
      return null;
    }
  }

  /**
   * Получить все накопленные инструменты
   */
  getCompletedTools(): ParsedToolEvent[] {
    return [...this.pendingTools];
  }

  /**
   * Сбросить состояние
   */
  reset(): void {
    this.buffer = "";
    this.lastProcessedLength = 0;
    this.pendingTools = [];
  }
}
