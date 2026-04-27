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
    
    // Пытаемся найти завершённые JSON-блоки
    const completedTools: ParsedToolEvent[] = [];
    
    // Ищем все ```json ... ``` блоки
    const fencedRegex = /```([A-Za-z0-9_-]*)\s*\r?\n?([\s\S]*?)\s*```/g;
    let match;
    let lastMatchEnd = 0;
    
    while ((match = fencedRegex.exec(this.buffer)) !== null) {
      if (completedTools.length >= this.maxTools) break;
      
      const language = match[1]?.trim().toLowerCase() ?? "";
      if (language === "yaml" || language === "yml") continue;
      
      const content = match[2]?.trim();
      if (!content) continue;
      
      // Проверяем, что JSON валидный (полный)
      const envelope = this.tryParseCompleteJson(content);
      if (!envelope) continue;
      
      // Блок завершён — можно отдавать
      const start = match.index ?? 0;
      const preText = this.buffer.slice(this.lastProcessedLength, start).trim();
      
      completedTools.push({ type: "tool", preText, envelope });
      lastMatchEnd = start + match[0].length;
    }
    
    // Обновляем последнюю обработанную позицию
    if (lastMatchEnd > 0) {
      this.lastProcessedLength = lastMatchEnd;
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

  /**
   * Проверить, что JSON полностью валидный (не оборван)
   */
  private tryParseCompleteJson(content: string): ToolCallEnvelope | null {
    try {
      // Пробуем распарсить
      const parsed = JSON.parse(content);
      
      // Проверяем, что это валидный тул-вызов
      if (typeof parsed.tool !== "string" || parsed.tool.length === 0) {
        return null;
      }
      
      const args = typeof parsed.args === "object" && parsed.args !== null ? parsed.args : {};
      const onError = this.normalizeAction(parsed.onError, "continue") as any;
      const onSuccess = this.normalizeAction(parsed.onSuccess, "continue") as any;
      
      return {
        tool: parsed.tool,
        args,
        onError,
        onSuccess
      };
    } catch (e) {
      // JSON невалидный — возможно, оборван
      return null;
    }
  }

  private normalizeAction(value: unknown, fallback: string): string {
    const validActions = ["continue", "stop", "try-again", "ignore", "ask-user"];
    if (typeof value === "string" && validActions.includes(value)) {
      return value;
    }
    return fallback;
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
