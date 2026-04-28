import { stdin as input, stdout as output } from "node:process";
import { emitKeypressEvents } from "node:readline";
import type { Command } from "@/commands/types";
import { colors } from "@/cli/colors";
import { getCommandHintLines } from "@/cli/command-hints";
import {
    applyFileCompletion,
    type FileCompletionState,
    getFileCompletionState,
    formatInputLineWithMentions,
    getFileHintLines,
} from "@/cli/file-mentions";
import {
    type TerminalDriver,
    type TerminalKeyData,
    type TerminalKeyHandler,
    type ViewRenderResult,
    ViewManager,
} from "@/cli/view-manager";
import { ConfirmView } from "@/cli/views/confirm";
import { ChoiceView } from "@/cli/views/choice";

export type TerminalInputMode = "active" | "queue";

type QueueCallbacks = {
    onValueChange?: (value: string) => void;
    onStop?: () => void;
    onInterrupt?: () => void;
};

type TerminalInputController = {
    start: (commands: Map<string, Command>) => void;
    onSubmit: (handler: (value: string) => void) => () => void;
    setMode: (mode: TerminalInputMode) => void;
    setQueueSize: (size: number) => void;
    setRenderEnabled: (enabled: boolean) => void;
    setQueueCallbacks: (callbacks: QueueCallbacks) => void;
    setStatusLine: (getter: () => string) => void;
    setPromptPrefix: (prefix: string) => void;
    choose: (title: string, items: TerminalChoiceItem[]) => Promise<string | null>;
    confirm: (message: string) => Promise<boolean>;
    close: () => void;
    viewManager: ViewManager;
};

type TerminalInputOptions = {
    getWorkspaceRoot?: () => string;
};

export type TerminalChoiceItem = {
    value: string;
    label: string;
    hint?: string;
};

const PROMPT_PREFIX = `${colors.magenta(">")} `;
const QUEUE_PREFIX = `${colors.dim("[+]")} `;
const CONTINUATION_PREFIX = `${colors.dim("…")} `;
const PROMPT_WIDTH = 2;
const CONTINUATION_WIDTH = 2;
const SHIFT_ENTER_SEQUENCES = new Set(["\x1b[13;2u", "\x1b\r"]);

const PASTE_S = "\x02";
const PASTE_E = "\x03";

function makePasteSentinel(id: number): string
{
    return `${PASTE_S}p:${id}${PASTE_E}`;
}

function pasteTokenText(lineCount: number): string
{
    return `[вставка: ${lineCount} строк]`;
}

function getSentinelBefore(value: string, cursor: number): { start: number; end: number; id: number } | null
{
    if (cursor === 0 || value[cursor - 1] !== PASTE_E) return null;
    const start = value.lastIndexOf(PASTE_S, cursor - 2);
    if (start === -1) return null;
    const inner = value.slice(start + 1, cursor - 1);
    if (!inner.startsWith("p:")) return null;
    const id = parseInt(inner.slice(2), 10);
    return isNaN(id) ? null : { start, end: cursor, id };
}

function getSentinelAfter(value: string, cursor: number): { start: number; end: number; id: number } | null
{
    if (cursor >= value.length || value[cursor] !== PASTE_S) return null;
    const end = value.indexOf(PASTE_E, cursor + 1);
    if (end === -1) return null;
    const inner = value.slice(cursor + 1, end);
    if (!inner.startsWith("p:")) return null;
    const id = parseInt(inner.slice(2), 10);
    return isNaN(id) ? null : { start: cursor, end: end + 1, id };
}

function expandPasteSentinels(value: string, blocks: Map<string, string>): string
{
    return value.replace(/\x02p:(\d+)\x03/g, (_, id) => blocks.get(id) ?? "");
}

function getVisualColumn(value: string, cursor: number, blocks: Map<string, string>): number
{
    const lineStart = getLineStart(value, cursor);
    const raw = value.slice(lineStart, cursor);
    const visual = raw.replace(/\x02p:(\d+)\x03/g, (_, id) =>
    {
        const content = blocks.get(id) ?? "";
        return pasteTokenText(content.split("\n").length);
    });
    return visual.length;
}

function renderLineWithPasteBlocks(line: string, blocks: Map<string, string>): string
{
    return line.replace(/\x02p:(\d+)\x03/g, (_, id) =>
    {
        const content = blocks.get(id) ?? "";
        const lineCount = content.split("\n").length;
        return colors.yellow(pasteTokenText(lineCount));
    });
}

function splitLines(value: string): string[]
{
    return value.length === 0 ? [""] : value.split("\n");
}

function getCursorMetrics(value: string, cursor: number): { row: number; column: number }
{
    const beforeCursor = value.slice(0, cursor);
    const parts = beforeCursor.split("\n");
    const row = parts.length - 1;
    const lastLine = parts.at(-1) ?? "";
    return { row, column: lastLine.length };
}

function getLineStart(value: string, cursor: number): number
{
    const newlineIndex = value.lastIndexOf("\n", Math.max(0, cursor - 1));
    return newlineIndex + 1;
}

function getLineEnd(value: string, cursor: number): number
{
    const newlineIndex = value.indexOf("\n", cursor);
    return newlineIndex === -1 ? value.length : newlineIndex;
}

function getPreviousLineCursor(value: string, cursor: number): number
{
    const currentLineStart = getLineStart(value, cursor);
    if (currentLineStart === 0) return cursor;
    const targetColumn = cursor - currentLineStart;
    const previousLineEnd = currentLineStart - 1;
    const previousLineStart = getLineStart(value, previousLineEnd);
    const previousLineLength = previousLineEnd - previousLineStart;
    return previousLineStart + Math.min(targetColumn, previousLineLength);
}

function getNextLineCursor(value: string, cursor: number): number
{
    const currentLineStart = getLineStart(value, cursor);
    const currentLineEnd = getLineEnd(value, cursor);
    if (currentLineEnd >= value.length) return cursor;
    const targetColumn = cursor - currentLineStart;
    const nextLineStart = currentLineEnd + 1;
    const nextLineEnd = getLineEnd(value, nextLineStart);
    const nextLineLength = nextLineEnd - nextLineStart;
    return nextLineStart + Math.min(targetColumn, nextLineLength);
}

function isShiftEnter(sequence: string | undefined): boolean
{
    return sequence !== undefined && SHIFT_ENTER_SEQUENCES.has(sequence);
}

function createNativeDriver(): TerminalDriver
{
    emitKeypressEvents(input);

    const listeners = new Map<TerminalKeyHandler, (
        char: string,
        key: { name?: string; ctrl?: boolean; sequence?: string } | undefined,
    ) => void>();

    const normalizeKeyName = (
        char: string,
        key: { name?: string; ctrl?: boolean; sequence?: string } | undefined,
    ): { name: string; data: TerminalKeyData } =>
    {
        const sequence = key?.sequence;
        if (key?.ctrl && key.name === "c")
            return { name: "CTRL_C", data: { code: sequence, isCharacter: false } };
        if (key?.name === "return" || key?.name === "enter")
            return { name: "ENTER", data: { code: sequence, isCharacter: false } };
        if (key?.name === "backspace")
            return { name: "BACKSPACE", data: { code: sequence, isCharacter: false } };
        if (key?.name === "delete")
            return { name: "DELETE", data: { code: sequence, isCharacter: false } };
        if (key?.name === "escape")
            return { name: "ESCAPE", data: { code: sequence, isCharacter: false } };
        if (key?.name === "left") return { name: "LEFT", data: { code: sequence, isCharacter: false } };
        if (key?.name === "right") return { name: "RIGHT", data: { code: sequence, isCharacter: false } };
        if (key?.name === "up") return { name: "UP", data: { code: sequence, isCharacter: false } };
        if (key?.name === "down") return { name: "DOWN", data: { code: sequence, isCharacter: false } };
        if (key?.name === "home") return { name: "HOME", data: { code: sequence, isCharacter: false } };
        if (key?.name === "end") return { name: "END", data: { code: sequence, isCharacter: false } };
        if (key?.name === "tab") return { name: "TAB", data: { code: sequence, isCharacter: false } };
        if (key?.ctrl && key.name === "e") return { name: "CTRL_E", data: { code: sequence, isCharacter: false } };
        if (sequence === "\x1b[200~") return { name: "PASTE_START", data: { code: sequence, isCharacter: false } };
        if (sequence === "\x1b[201~") return { name: "PASTE_END", data: { code: sequence, isCharacter: false } };
        return { name: char, data: { code: sequence, isCharacter: char.length > 0 } };
    };

    return {
        grabInput: (): void =>
        {
            if (!input.isTTY) return;
            input.setRawMode?.(true);
            input.resume();
            output.write("\x1b[?2004h");
        },
        releaseInput: (): void =>
        {
            if (!input.isTTY) return;
            output.write("\x1b[?2004l");
            input.setRawMode?.(false);
        },
        hideCursor: (): void => { output.write("\x1b[?25l"); },
        showCursor: (): void => { output.write("\x1b[?25h"); },
        onKey: (listener): void =>
        {
            const wrappedListener = (
                char: string,
                key: { name?: string; ctrl?: boolean; sequence?: string } | undefined,
            ): void =>
            {
                const normalized = normalizeKeyName(char, key);
                listener(normalized.name, [], normalized.data);
            };
            listeners.set(listener, wrappedListener);
            input.on("keypress", wrappedListener);
        },
        offKey: (listener): void =>
        {
            const wrappedListener = listeners.get(listener);
            if (!wrappedListener) return;
            input.off("keypress", wrappedListener);
            listeners.delete(listener);
        },
    };
}

async function createTerminalDriver(): Promise<TerminalDriver>
{
    try
    {
        const terminalKitModule = await import("terminal-kit");
        const terminalKit = terminalKitModule.default;
        const term = terminalKit.terminal;
        const listeners = new Map<TerminalKeyHandler, TerminalKeyHandler>();
        const normalizeName = (name: string, data?: TerminalKeyData, matches?: string[]): string =>
        {
            const raw = name ?? "";
            const upper = raw.toUpperCase();
            const hasCtrlCMatch = (matches ?? []).some((item) => item.toUpperCase() === "CTRL_C");
            if (
                upper === "CTRL_C"
                || upper === "CTRL-C"
                || upper === "CTRL C"
                || upper === "^C"
                || hasCtrlCMatch
                || data?.code === "\x03"
            )
            {
                return "CTRL_C";
            }
            return raw;
        };
        return {
            grabInput: (): void => { term.grabInput(true); output.write("\x1b[?2004h"); },
            releaseInput: (): void => { output.write("\x1b[?2004l"); term.grabInput(false); },
            hideCursor: (): void => { term.hideCursor(); },
            showCursor: (): void => { term.hideCursor(false); },
            onKey: (listener): void =>
            {
                const wrapped: TerminalKeyHandler = (name, matches, data) =>
                {
                    listener(normalizeName(name, data, matches), matches, data ?? {});
                };
                listeners.set(listener, wrapped);
                term.on("key", wrapped);
            },
            offKey: (listener): void =>
            {
                const wrapped = listeners.get(listener);
                if (!wrapped) return;
                term.off("key", wrapped);
                listeners.delete(listener);
            },
        };
    }
    catch
    {
        return createNativeDriver();
    }
}

function buildRenderedBlock(
    value: string,
    _cursor: number,
    mode: TerminalInputMode,
    queueSize: number,
    commands: Map<string, Command>,
    workspaceRoot: string,
    fileCompletionState: FileCompletionState,
    fileSelectionIndex: number,
    statusLine: string,
    pasteBlocks: Map<string, string>,
    showPasteHint: boolean,
    promptPrefix: string,
): string
{
    const inputLines = splitLines(value).map((line) => line);

    const firstLinePrefix = mode === "queue"
        ? QUEUE_PREFIX
        : promptPrefix;

    const lines = inputLines.map((line, index) =>
        `${index === 0 ? firstLinePrefix : CONTINUATION_PREFIX}${renderLineWithPasteBlocks(formatInputLineWithMentions(line, workspaceRoot), pasteBlocks)}`
    );

    // Queue indicator on its own line when in queue mode
    if (mode === "queue" && queueSize > 0)
    {
        lines.push(colors.dim(`[+${queueSize}]`));
    }

    if (mode !== "queue")
    {
        if (statusLine.length > 0)
        {
            lines.push(statusLine);
        }

        if (showPasteHint)
        {
            lines.push(colors.dim("Backspace — удалить блок  Ctrl+E — развернуть"));
        }
        else
        {
            const fileHintLines = getFileHintLines(fileCompletionState, fileSelectionIndex);
            const hintLines = fileHintLines.length > 0
                ? fileHintLines
                : getCommandHintLines(value, commands);
            if (hintLines.length > 0) lines.push(colors.dim("Подсказки:"), ...hintLines);
        }
    }

    return lines.join("\n");
}

export function createTerminalInput(options: TerminalInputOptions = {}): TerminalInputController
{
    let driverPromise: Promise<TerminalDriver> | null = null;
    let fileSelectionKey: string | null = null;
    let fileSelectionIndex = 0;
    let mode: TerminalInputMode = "active";
    let queueSize = 0;
    let activeCommands: Map<string, Command> = new Map();

    const submitHandlers = new Set<(value: string) => void>();
    const pasteBlocks = new Map<string, string>();
    let pasteIdCounter = 0;
    let isPasting = false;
    let pasteBuffer = "";

    const charBatch: string[] = [];
    let charBatchScheduled = false;

    const state = {
        value: "",
        cursor: 0,
    };

    const history: string[] = [];
    let historyIndex = -1;
    let historyDraft = "";

    let cmdTabIndex = -1;
    let cmdTabQuery = "";

    const getWorkspaceRoot = options.getWorkspaceRoot ?? (() => process.cwd());

    const vm = new ViewManager();

    const getDriver = async (): Promise<TerminalDriver> =>
    {
        driverPromise ??= createTerminalDriver();
        return driverPromise;
    };

    const getActiveFileCompletionState = (): FileCompletionState =>
    {
        const completionState = getFileCompletionState(state.value, state.cursor, getWorkspaceRoot());
        if (completionState.key === null || completionState.options.length === 0)
        {
            fileSelectionKey = null;
            fileSelectionIndex = 0;
            return completionState;
        }
        if (fileSelectionKey !== completionState.key)
        {
            fileSelectionKey = completionState.key;
            fileSelectionIndex = 0;
        }
        if (fileSelectionIndex >= completionState.options.length) fileSelectionIndex = 0;
        return completionState;
    };

    let queueCallbacks: QueueCallbacks = {};
    let getStatusLine: () => string = () => "";
    let activePromptPrefix = PROMPT_PREFIX;

    const notifyValueChange = (): void =>
    {
        if (vm.suspended) queueCallbacks.onValueChange?.(state.value);
    };

    const submit = (rawValue: string): void =>
    {
        const wasSuspended = vm.suspended;
        if (!wasSuspended)
        {
            vm.suspend();
            output.write("\n");
        }
        state.value = "";
        state.cursor = 0;

        const expandedValue = expandPasteSentinels(rawValue, pasteBlocks);
        pasteBlocks.clear();
        const trimmedValue = expandedValue.trim();
        if (trimmedValue.length > 0)
        {
            if (history.at(-1) !== trimmedValue) history.push(trimmedValue);
        }
        historyIndex = -1;
        historyDraft = "";
        cmdTabIndex = -1;
        cmdTabQuery = "";

        for (const handler of submitHandlers)
        {
            handler(trimmedValue);
        }

        if (!wasSuspended)
        {
            // Don't resume here — let run-cli control when rendering restarts
            // (after mode is set to "queue" for AI requests, or after command execution)
        }
        else
        {
            queueCallbacks.onValueChange?.("");
            queueCallbacks.onStop?.();
        }
    };

    const flushCharBatch = (): void =>
    {
        if (charBatch.length === 0) return;
        const chars = charBatch.splice(0);
        charBatchScheduled = false;
        historyIndex = -1;
        historyDraft = "";
        cmdTabIndex = -1;
        cmdTabQuery = "";
        const text = chars.join("");
        const isLarge = text.includes("\n") || text.length > 80;
        if (isLarge)
        {
            const id = pasteIdCounter++;
            pasteBlocks.set(String(id), text);
            const sentinel = makePasteSentinel(id);
            state.value = state.value.slice(0, state.cursor) + sentinel + state.value.slice(state.cursor);
            state.cursor += sentinel.length;
        }
        else if (chars.length === 1)
        {
            const char = chars[0]!;
            const previousCharacter = state.cursor > 0 ? state.value.at(state.cursor - 1) : undefined;
            if (char === "n" && previousCharacter === "\\")
            {
                state.value = state.value.slice(0, state.cursor - 1) + "\n" + state.value.slice(state.cursor);
            }
            else
            {
                state.value = state.value.slice(0, state.cursor) + char + state.value.slice(state.cursor);
                state.cursor += char.length;
            }
        }
        else
        {
            state.value = state.value.slice(0, state.cursor) + text + state.value.slice(state.cursor);
            state.cursor += text.length;
        }
        vm.invalidate();
        notifyValueChange();
    };

    const scheduleCharBatchFlush = (): void =>
    {
        if (charBatchScheduled) return;
        charBatchScheduled = true;
        process.nextTick(flushCharBatch);
    };

    const onKey = (name: string, data: TerminalKeyData): void =>
    {
        if (name === "PASTE_START")
        {
            isPasting = true;
            pasteBuffer = "";
            return;
        }

        if (isPasting)
        {
            if (name === "PASTE_END")
            {
                isPasting = false;
                if (pasteBuffer.length > 0)
                {
                    const isLarge = pasteBuffer.includes("\n") || pasteBuffer.length > 80;
                    if (isLarge)
                    {
                        const id = pasteIdCounter++;
                        pasteBlocks.set(String(id), pasteBuffer);
                        const sentinel = makePasteSentinel(id);
                        state.value = state.value.slice(0, state.cursor) + sentinel + state.value.slice(state.cursor);
                        state.cursor += sentinel.length;
                    }
                    else
                    {
                        state.value = state.value.slice(0, state.cursor) + pasteBuffer + state.value.slice(state.cursor);
                        state.cursor += pasteBuffer.length;
                    }
                    pasteBuffer = "";
                    vm.invalidate();
                    notifyValueChange();
                }
                return;
            }
            if (name === "ENTER" || name === "KP_ENTER") { pasteBuffer += "\n"; return; }
            if (name === "TAB") { pasteBuffer += "\t"; return; }
            if (data.isCharacter) { pasteBuffer += name; return; }
            return;
        }

        if (name === "CTRL_C")
        {
            if (vm.suspended)
            {
                queueCallbacks.onInterrupt?.();
                queueCallbacks.onStop?.();
                return;
            }
            submit("/exit");
            return;
        }

        if (name === "CTRL_E")
        {
            const sent = getSentinelBefore(state.value, state.cursor) ?? getSentinelAfter(state.value, state.cursor);
            if (sent)
            {
                const content = pasteBlocks.get(String(sent.id)) ?? "";
                pasteBlocks.delete(String(sent.id));
                state.value = state.value.slice(0, sent.start) + content + state.value.slice(sent.end);
                state.cursor = sent.start + content.length;
                vm.invalidate();
            }
            return;
        }

        if (isShiftEnter(data.code))
        {
            state.value = `${state.value.slice(0, state.cursor)}\n${state.value.slice(state.cursor)}`;
            state.cursor += 1;
            vm.invalidate();
            notifyValueChange();
            return;
        }

        if (data.isCharacter)
        {
            charBatch.push(name);
            scheduleCharBatchFlush();
            return;
        }

        if ((name === "ENTER" || name === "KP_ENTER") && charBatch.length > 0)
        {
            charBatch.push("\n");
            scheduleCharBatchFlush();
            return;
        }

        flushCharBatch();

        switch (name)
        {
            case "ENTER":
            case "KP_ENTER":
            {
                const prevChar = state.cursor > 0 ? state.value.at(state.cursor - 1) : undefined;
                if (prevChar === "\\")
                {
                    state.value = state.value.slice(0, state.cursor - 1) + "\n" + state.value.slice(state.cursor);
                    vm.invalidate();
                    notifyValueChange();
                    return;
                }
                submit(state.value);
                return;
            }
            case "BACKSPACE":
            {
                if (state.cursor === 0) return;
                const sentB = getSentinelBefore(state.value, state.cursor);
                if (sentB)
                {
                    pasteBlocks.delete(String(sentB.id));
                    state.value = state.value.slice(0, sentB.start) + state.value.slice(sentB.end);
                    state.cursor = sentB.start;
                }
                else
                {
                    state.value = state.value.slice(0, state.cursor - 1) + state.value.slice(state.cursor);
                    state.cursor -= 1;
                }
                vm.invalidate();
                notifyValueChange();
                return;
            }
            case "DELETE":
            {
                if (state.cursor >= state.value.length) return;
                const sentD = getSentinelAfter(state.value, state.cursor);
                if (sentD)
                {
                    pasteBlocks.delete(String(sentD.id));
                    state.value = state.value.slice(0, sentD.start) + state.value.slice(sentD.end);
                }
                else
                {
                    state.value = state.value.slice(0, state.cursor) + state.value.slice(state.cursor + 1);
                }
                vm.invalidate();
                notifyValueChange();
                return;
            }
            case "LEFT":
            {
                if (state.cursor === 0) return;
                const sentL = getSentinelBefore(state.value, state.cursor);
                if (sentL) { state.cursor = sentL.start; vm.invalidate(); return; }
                state.cursor -= 1;
                vm.invalidate();
                return;
            }
            case "RIGHT":
            {
                if (state.cursor >= state.value.length) return;
                const sentR = getSentinelAfter(state.value, state.cursor);
                if (sentR) { state.cursor = sentR.end; vm.invalidate(); return; }
                state.cursor += 1;
                vm.invalidate();
                return;
            }
            case "HOME":
                state.cursor = getLineStart(state.value, state.cursor);
                vm.invalidate();
                return;
            case "END":
                state.cursor = getLineEnd(state.value, state.cursor);
                vm.invalidate();
                return;
            case "TAB":
            {
                if (mode === "queue") return;
                const completionState = getActiveFileCompletionState();
                if (completionState.options.length > 0)
                {
                    const selectedOption = completionState.options[fileSelectionIndex];
                    if (completionState.options.length > 1 && selectedOption?.insertPath === completionState.query)
                    {
                        fileSelectionIndex = (fileSelectionIndex + 1) % completionState.options.length;
                    }
                    const completionResult = applyFileCompletion(state.value, state.cursor, getWorkspaceRoot(), fileSelectionIndex);
                    if (!completionResult.completed) return;
                    state.value = completionResult.value;
                    state.cursor = completionResult.cursor;
                    vm.invalidate();
                    return;
                }
                {
                    const trimmed = state.value.trimStart();
                    if (trimmed.startsWith("/") && !trimmed.includes(" "))
                    {
                        const matches = Array.from(activeCommands.values())
                            .map((c) => c.name)
                            .filter((n) => n.startsWith(trimmed.toLowerCase()));
                        if (matches.length > 0)
                        {
                            if (cmdTabQuery !== trimmed)
                            {
                                cmdTabQuery = trimmed;
                                cmdTabIndex = -1;
                            }
                            cmdTabIndex = (cmdTabIndex + 1) % matches.length;
                            state.value = matches[cmdTabIndex] ?? state.value;
                            state.cursor = state.value.length;
                            vm.invalidate();
                            return;
                        }
                    }
                }
                return;
            }
            case "UP":
            {
                if (mode !== "queue")
                {
                    const completionState = getActiveFileCompletionState();
                    if (completionState.options.length > 0)
                    {
                        fileSelectionIndex = fileSelectionIndex === 0
                            ? completionState.options.length - 1
                            : fileSelectionIndex - 1;
                        vm.invalidate();
                        return;
                    }
                    const { row } = getCursorMetrics(state.value, state.cursor);
                    if (row === 0 && history.length > 0)
                    {
                        if (historyIndex === -1) historyDraft = state.value;
                        historyIndex = Math.min(historyIndex + 1, history.length - 1);
                        state.value = history[history.length - 1 - historyIndex] ?? "";
                        state.cursor = state.value.length;
                        vm.invalidate();
                        return;
                    }
                }
                state.cursor = getPreviousLineCursor(state.value, state.cursor);
                vm.invalidate();
                return;
            }
            case "DOWN":
            {
                if (mode !== "queue")
                {
                    const completionState = getActiveFileCompletionState();
                    if (completionState.options.length > 0)
                    {
                        fileSelectionIndex = (fileSelectionIndex + 1) % completionState.options.length;
                        vm.invalidate();
                        return;
                    }
                    const { row } = getCursorMetrics(state.value, state.cursor);
                    const lineCount = splitLines(state.value).length;
                    if (historyIndex >= 0 && row === lineCount - 1)
                    {
                        historyIndex -= 1;
                        state.value = historyIndex < 0
                            ? historyDraft
                            : (history[history.length - 1 - historyIndex] ?? "");
                        state.cursor = state.value.length;
                        vm.invalidate();
                        return;
                    }
                }
                state.cursor = getNextLineCursor(state.value, state.cursor);
                vm.invalidate();
                return;
            }
            default:
                return;
        }
    };

    const chatInputView = {
        id: "chat-input",
        onKey,
        render(): ViewRenderResult
        {
            const sentBefore = getSentinelBefore(state.value, state.cursor);
            const sentAfter = getSentinelAfter(state.value, state.cursor);
            const showPasteHint = sentBefore !== null || sentAfter !== null;
            const block = buildRenderedBlock(
                state.value,
                state.cursor,
                mode,
                queueSize,
                activeCommands,
                getWorkspaceRoot(),
                getActiveFileCompletionState(),
                fileSelectionIndex,
                getStatusLine(),
                pasteBlocks,
                showPasteHint,
                activePromptPrefix,
            );
            const lines = block.split("\n");
            const cursorMetrics = getCursorMetrics(state.value, state.cursor);
            const visualCol = getVisualColumn(state.value, state.cursor, pasteBlocks);
            const cursorCol = cursorMetrics.row === 0
                ? PROMPT_WIDTH + visualCol
                : CONTINUATION_WIDTH + visualCol;
            return { lines, cursorRow: cursorMetrics.row, cursorCol };
        },
    };

    vm.initBaseView(chatInputView);

    const start = (commands: Map<string, Command>): void =>
    {
        activeCommands = commands;
        getDriver().then((driver) =>
        {
            vm.setDriver(driver);
            driver.grabInput();
            driver.showCursor();
            vm.invalidate();
        });
    };

    const onSubmit = (handler: (value: string) => void): (() => void) =>
    {
        submitHandlers.add(handler);
        return () => submitHandlers.delete(handler);
    };

    const setMode = (nextMode: TerminalInputMode): void =>
    {
        if (mode === nextMode) return;
        mode = nextMode;
        vm.invalidate();
    };

    const setQueueSize = (size: number): void =>
    {
        if (queueSize === size) return;
        queueSize = size;
        vm.invalidate();
    };

    const setRenderEnabled = (enabled: boolean): void =>
    {
        if (enabled) vm.resume();
        else vm.suspend();
    };

    const setQueueCallbacks = (callbacks: QueueCallbacks): void =>
    {
        queueCallbacks = callbacks;
    };

    const setStatusLine = (getter: () => string): void =>
    {
        getStatusLine = getter;
    };

    const setPromptPrefix = (prefix: string): void =>
    {
        activePromptPrefix = prefix;
        vm.invalidate();
    };

    const choose = (title: string, items: TerminalChoiceItem[]): Promise<string | null> =>
    {
        if (items.length === 0) return Promise.resolve(null);
        return new Promise<string | null>((resolve) =>
        {
            vm.push(new ChoiceView(title, items, resolve));
        });
    };

    const confirm = (message: string): Promise<boolean> =>
    {
        return new Promise<boolean>((resolve) =>
        {
            vm.push(new ConfirmView(message, resolve));
        });
    };

    const close = (): void =>
    {
        vm.destroy();
    };

    return { start, onSubmit, setMode, setQueueSize, setRenderEnabled, setQueueCallbacks, setStatusLine, setPromptPrefix, choose, confirm, close, viewManager: vm };
}
