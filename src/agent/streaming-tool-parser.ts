import type { ToolCallEnvelope } from "./types";
import { parseMessage, tryParseEnvelope, extractJsonLikeBlocks } from "./tool-call-parser";

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

// Languages that a model plausibly uses to wrap a tool-call JSON block.
// Everything else (python, bash, yaml, xml…) is skipped without parsing.
const TOOL_FENCE_LANGUAGES = new Set(["", "json", "javascript", "js", "typescript", "ts"]);

export class StreamingToolParser {
  private buffer = "";
  private lastProcessedLength = 0;
  private pendingTools: ParsedToolEvent[] = [];
  private warnings: ToolParseWarning[] = [];
  private maxTools: number;

  // An opening fence whose closing ``` hasn't arrived yet.
  // skip=true  → non-tool language; just advance past it when it closes
  // skip=false → potential tool call; parse content when it closes
  private pendingFence: {
    language: string;
    fenceStart: number;
    contentStart: number;
    skip: boolean;
  } | null = null;

  constructor(options: StreamingToolParserOptions = {}) {
    this.maxTools = options.maxTools ?? 10;
  }

  feed(chunk: string): ParsedToolEvent[] {
    this.buffer += chunk;
    const completedTools: ParsedToolEvent[] = [];

    // Step 1: close a fence that was open at the end of the previous chunk
    if (this.pendingFence !== null) {
      if (!this.tryCompletePendingFence(completedTools)) {
        // Closing ``` still hasn't arrived — don't scan past the open fence
        return completedTools;
      }
    }

    // Step 2: scan forward for new fenced blocks
    const fencedRegex = /```([A-Za-z0-9_-]*)\s*\r?\n?/g;
    fencedRegex.lastIndex = this.lastProcessedLength;

    let match: RegExpExecArray | null;
    while ((match = fencedRegex.exec(this.buffer)) !== null) {
      if (completedTools.length >= this.maxTools) break;

      const language = match[1]?.trim().toLowerCase() ?? "";
      const fenceStart = match.index!;
      const contentStart = fenceStart + match[0].length;
      const isToolLang = TOOL_FENCE_LANGUAGES.has(language);

      const closeFenceIdx = this.buffer.indexOf("```", contentStart);

      if (closeFenceIdx === -1) {
        // No closing ``` yet — save state and stop scanning
        this.pendingFence = { language, fenceStart, contentStart, skip: !isToolLang };
        break;
      }

      const blockEnd = closeFenceIdx + 3;

      if (!isToolLang) {
        // Non-tool language — skip the whole block
        this.lastProcessedLength = blockEnd;
        fencedRegex.lastIndex = blockEnd;
        continue;
      }

      const raw = this.buffer.slice(contentStart, closeFenceIdx).trim();
      const content = stripLeadingLanguageTag(raw);
      const envelope = tryParseEnvelope(content);

      if (envelope) {
        const preText = this.buffer.slice(this.lastProcessedLength, fenceStart).trim();
        completedTools.push({ type: "tool", preText, envelope });
      } else if (/["']?tool["']?\s*:/.test(content)) {
        this.warnings.push({ content: content.slice(0, 500) });
      }

      this.lastProcessedLength = blockEnd;
      fencedRegex.lastIndex = blockEnd;
    }

    // Step 3: no fenced tools and no pending fence — try bare JSON
    if (completedTools.length === 0 && this.pendingFence === null) {
      this.tryBareJson(completedTools);
    }

    if (completedTools.length > 0) {
      this.pendingTools.push(...completedTools);
    }

    return completedTools;
  }

  // Returns true when the fence was resolved (completed or skipped), false if still waiting.
  private tryCompletePendingFence(completedTools: ParsedToolEvent[]): boolean {
    const fence = this.pendingFence!;
    const closeFenceIdx = this.buffer.indexOf("```", fence.contentStart);
    if (closeFenceIdx === -1) return false;

    const blockEnd = closeFenceIdx + 3;

    if (!fence.skip) {
      const raw = this.buffer.slice(fence.contentStart, closeFenceIdx).trim();
      const content = stripLeadingLanguageTag(raw);
      const envelope = tryParseEnvelope(content);

      if (envelope) {
        const preText = this.buffer.slice(this.lastProcessedLength, fence.fenceStart).trim();
        completedTools.push({ type: "tool", preText, envelope });
      } else if (/["']?tool["']?\s*:/.test(content)) {
        this.warnings.push({ content: content.slice(0, 500) });
      }
    }

    this.lastProcessedLength = blockEnd;
    this.pendingFence = null;
    return true;
  }

  private tryBareJson(completedTools: ParsedToolEvent[]): void {
    if (completedTools.length >= this.maxTools) return;

    const searchFrom = this.lastProcessedLength;
    const remaining = this.buffer.slice(searchFrom);
    const blocks = extractJsonLikeBlocks(remaining);

    for (const candidate of blocks) {
      const envelope = tryParseEnvelope(candidate);
      if (!envelope) continue;

      // candidate is a direct substring of remaining (extractJsonLikeBlocks doesn't mangle it)
      const relIdx = remaining.indexOf(candidate);
      if (relIdx === -1) continue;

      const blockStart = searchFrom + relIdx;
      const preText = this.buffer.slice(searchFrom, blockStart).trim();
      completedTools.push({ type: "tool", preText, envelope });
      this.lastProcessedLength = blockStart + candidate.length;
      break; // one bare tool per feed cycle; next cycle will find more if any
    }
  }

  finalize(): ParsedToolEvent[] {
    const completedTools: ParsedToolEvent[] = [];

    // Handle an unclosed fence at stream end (model stopped mid-block)
    if (this.pendingFence !== null) {
      if (!this.pendingFence.skip) {
        const raw = this.buffer.slice(this.pendingFence.contentStart).trim();
        const content = stripLeadingLanguageTag(raw);
        const envelope = tryParseEnvelope(content);
        if (envelope) {
          const preText = this.buffer.slice(this.lastProcessedLength, this.pendingFence.fenceStart).trim();
          completedTools.push({ type: "tool", preText, envelope });
        }
      }
      this.lastProcessedLength = this.buffer.length;
      this.pendingFence = null;
    }

    // Fallback: let parseMessage (full regex + bare-JSON) sweep the remainder
    const remaining = this.buffer.slice(this.lastProcessedLength);
    if (remaining.trim().length > 0) {
      const capacity = this.maxTools - this.pendingTools.length - completedTools.length;
      if (capacity > 0) {
        const fallbackResult = parseMessage(remaining, capacity);
        const finalTools: ParsedToolEvent[] = fallbackResult.toolCalls.map(tc => ({
          type: "tool",
          preText: tc.preText,
          envelope: tc.envelope,
        }));

        if (finalTools.length > 0) {
          completedTools.push(...finalTools);
          this.lastProcessedLength = this.buffer.length;
        } else if (/["']?tool["']?\s*:/.test(remaining)) {
          this.warnings.push({ content: remaining.trim().slice(0, 500) });
        }
      }
    }

    if (completedTools.length > 0) {
      this.pendingTools.push(...completedTools);
    }

    return completedTools;
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
    this.pendingFence = null;
  }
}

// When the opening ``` and its language tag arrive in different streaming chunks,
// the language tag ends up as the first line of the content.  Strip it.
// e.g. "json\n{...}" → "{...}"
function stripLeadingLanguageTag(content: string): string {
  const newline = content.indexOf("\n");
  if (newline === -1) return content;
  const firstLine = content.slice(0, newline).trim();
  if (firstLine.length > 0 && /^[A-Za-z0-9_-]+$/.test(firstLine)) {
    return content.slice(newline + 1).trim();
  }
  return content;
}
