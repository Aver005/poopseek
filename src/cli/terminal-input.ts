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

export type TerminalInputMode = "active" | "queue";

type QueueCallbacks = {
    onValueChange?: (value: string) => void;
    onStop?: () => void;
};

type TerminalInputController = {
    start: (commands: Map<string, Command>) => void;
    onSubmit: (handler: (value: string) => void) => () => void;
    setMode: (mode: TerminalInputMode) => void;
    setQueueSize: (size: number) => void;
    setRenderEnabled: (enabled: boolean) => void;
    setQueueCallbacks: (callbacks: QueueCallbacks) => void;
    setStatusLine: (getter: () => string) => void;
    choose: (title: string, items: TerminalChoiceItem[]) => Promise<string | null>;
    confirm: (message: string) => Promise<boolean>;
    close: () => void;
};

type TerminalInputOptions = {
    getWorkspaceRoot?: () => string;
};

type TerminalKeyData = {
    code?: string;
    isCharacter?: boolean;
};

type TerminalKeyHandler = (name: string, matches: string[], data: TerminalKeyData) => void;

export type TerminalChoiceItem = {
    value: string;
    label: string;
    hint?: string;
};

type TerminalDriver = {
    grabInput: () => void;
    releaseInput: () => void;
    hideCursor: () => void;
    showCursor: () => void;
    onKey: (listener: TerminalKeyHandler) => void;
    offKey: (listener: TerminalKeyHandler) => void;
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
        return {
            grabInput: (): void => { term.grabInput(true); output.write("\x1b[?2004h"); },
            releaseInput: (): void => { output.write("\x1b[?2004l"); term.grabInput(false); },
            hideCursor: (): void => { term.hideCursor(); },
            showCursor: (): void => { term.hideCursor(false); },
            onKey: (listener): void => { term.on("key", listener); },
            offKey: (listener): void => { term.off("key", listener); },
        };
    }
    catch
    {
        return createNativeDriver();
    }
}

function buildRenderedBlock(
    value: string,
    cursor: number,
    mode: TerminalInputMode,
    queueSize: number,
    commands: Map<string, Command>,
    workspaceRoot: string,
    fileCompletionState: FileCompletionState,
    fileSelectionIndex: number,
    statusLine: string,
    pasteBlocks: Map<string, string>,
    showPasteHint: boolean,
): string
{
    const cursorMetrics = getCursorMetrics(value, cursor);
    const inputLines = splitLines(value).map((line) => line);
    const activeLine = inputLines[cursorMetrics.row];

    if (activeLine !== undefined)
    {
        const prefix = activeLine.slice(0, cursorMetrics.column);
        const nextCharacter = activeLine.at(cursorMetrics.column);
        const suffix = activeLine.slice(cursorMetrics.column + (nextCharacter === undefined ? 0 : 1));
        inputLines[cursorMetrics.row] = `${prefix}_${suffix}`;
    }

    const firstLinePrefix = mode === "queue"
        ? (queueSize > 0 ? `${colors.dim(`[+${queueSize}]`)} ` : QUEUE_PREFIX)
        : PROMPT_PREFIX;

    return inputLines.map((line, index) =>
        `${index === 0 ? firstLinePrefix : CONTINUATION_PREFIX}${renderLineWithPasteBlocks(formatInputLineWithMentions(line, workspaceRoot), pasteBlocks)}`
    ).concat((() =>
    {
        const extra: string[] = [];
        if (mode !== "queue")
        {
            if (showPasteHint)
            {
                extra.push(colors.dim("Backspace — удалить блок  Ctrl+E — развернуть"));
            }
            else
            {
                const fileHintLines = getFileHintLines(fileCompletionState, fileSelectionIndex);
                const hintLines = fileHintLines.length > 0
                    ? fileHintLines
                    : getCommandHintLines(value, commands);
                if (hintLines.length > 0) extra.push(colors.dim("Подсказки:"), ...hintLines);
            }
        }
        if (statusLine.length > 0) extra.push(statusLine);
        return extra;
    })()).join("\n");
}

function buildChoiceBlock(
    title: string,
    items: TerminalChoiceItem[],
    selectedIndex: number,
): string
{
    const visibleLimit = 12;
    const startIndex = items.length <= visibleLimit
        ? 0
        : Math.min(
            Math.max(0, selectedIndex - Math.floor(visibleLimit / 2)),
            items.length - visibleLimit,
        );
    const visibleItems = items.slice(startIndex, startIndex + visibleLimit);
    const lines = [
        colors.cyan(title),
        colors.dim("Enter - загрузить, Esc - отмена"),
    ];

    for (let index = 0; index < visibleItems.length; index += 1)
    {
        const item = visibleItems[index]!;
        const absoluteIndex = startIndex + index;
        const selected = absoluteIndex === selectedIndex;
        const marker = selected ? colors.green("›") : colors.dim(" ");
        const label = selected ? colors.green(item.label) : item.label;
        lines.push(`${marker} ${label}`);
        if (item.hint)
        {
            lines.push(`  ${colors.dim(item.hint)}`);
        }
    }

    if (startIndex > 0 || startIndex + visibleItems.length < items.length)
    {
        lines.push(colors.dim(`Показано ${startIndex + 1}-${startIndex + visibleItems.length} из ${items.length}`));
    }

    return lines.join("\n");
}

function buildConfirmBlock(message: string): string
{
    return [
        message,
        colors.dim("Enter — продолжить  Esc — отмена"),
    ].join("\n");
}

export function createTerminalInput(options: TerminalInputOptions = {}): TerminalInputController
{
    let driverPromise: Promise<TerminalDriver> | null = null;
    let activeDriver: TerminalDriver | null = null;
    let lastRenderLineCount = 0;
    let lastCursorRow = 0;
    let fileSelectionKey: string | null = null;
    let fileSelectionIndex = 0;
    let mode: TerminalInputMode = "active";
    let queueSize = 0;
    let activeCommands: Map<string, Command> = new Map();
    let choiceState: {
        title: string;
        items: TerminalChoiceItem[];
        selectedIndex: number;
        resolve: (value: string | null) => void;
    } | null = null;
    let confirmState: {
        message: string;
        resolve: (confirmed: boolean) => void;
    } | null = null;

    const submitHandlers = new Set<(value: string) => void>();

    const pasteBlocks = new Map<string, string>();
    let pasteIdCounter = 0;
    let isPasting = false;
    let pasteBuffer = "";

    const charBatch: string[] = [];
    let charBatchScheduled = false;

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
        render();
        if (!renderEnabled) queueCallbacks.onValueChange?.(state.value);
    };

    const scheduleCharBatchFlush = (): void =>
    {
        if (charBatchScheduled) return;
        charBatchScheduled = true;
        process.nextTick(flushCharBatch);
    };

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

    const getDriver = async (): Promise<TerminalDriver> =>
    {
        driverPromise ??= createTerminalDriver();
        activeDriver = await driverPromise;
        return activeDriver;
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

    const clearPreviousRender = (): void =>
    {
        if (lastRenderLineCount === 0) return;
        output.write("\r");
        if (lastCursorRow > 0) output.write(`\x1b[${lastCursorRow}A`);
        for (let index = 0; index < lastRenderLineCount; index += 1)
        {
            output.write("\x1b[2K");
            if (index < lastRenderLineCount - 1) output.write("\x1b[1B\r");
        }
        if (lastRenderLineCount > 1) output.write(`\x1b[${lastRenderLineCount - 1}A`);
        output.write("\r");
    };

    const render = (): void =>
    {
        if (!renderEnabled) return;
        const sentBefore = getSentinelBefore(state.value, state.cursor);
        const sentAfter = getSentinelAfter(state.value, state.cursor);
        const showPasteHint = sentBefore !== null || sentAfter !== null;
        const renderedBlock = confirmState
            ? buildConfirmBlock(confirmState.message)
            : choiceState
            ? buildChoiceBlock(choiceState.title, choiceState.items, choiceState.selectedIndex)
            : buildRenderedBlock(
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
            );
        const renderedLines = renderedBlock.split("\n");
        const renderedLineCount = renderedLines.length;
        const cursorMetrics = getCursorMetrics(state.value, state.cursor);
        const visualCol = getVisualColumn(state.value, state.cursor, pasteBlocks);
        const horizontalOffset = choiceState
            ? 0
            : (cursorMetrics.row === 0
                ? PROMPT_WIDTH + visualCol
                : CONTINUATION_WIDTH + visualCol);
        const linesUpFromBottom = choiceState
            ? 0
            : renderedLineCount - 1 - cursorMetrics.row;

        clearPreviousRender();
        output.write(renderedBlock);
        if (linesUpFromBottom > 0) output.write(`\x1b[${linesUpFromBottom}A`);
        output.write("\r");
        if (horizontalOffset > 0) output.write(`\x1b[${horizontalOffset}C`);

        lastRenderLineCount = renderedLineCount;
        // choiceState forces linesUpFromBottom=0, so after writing the block the
        // cursor sits at the bottom line. Record how far up clearPreviousRender must
        // travel to reach the first line of the block. For all other states the
        // cursor has already been repositioned to cursorMetrics.row from the top.
        lastCursorRow = choiceState ? renderedLineCount - 1 : cursorMetrics.row;
    };

    const submit = (rawValue: string): void =>
    {
        clearPreviousRender();
        if (renderEnabled) output.write("\n");
        lastRenderLineCount = 0;
        lastCursorRow = 0;
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

        if (!renderEnabled) queueCallbacks.onValueChange?.("");

        for (const handler of submitHandlers)
        {
            handler(trimmedValue);
        }

        render();
        if (!renderEnabled) queueCallbacks.onStop?.();
    };

    const onKey = (name: string, _matches: string[], data: TerminalKeyData): void =>
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
                    render();
                    if (!renderEnabled) queueCallbacks.onValueChange?.(state.value);
                }
                return;
            }
            if (name === "ENTER" || name === "KP_ENTER") { pasteBuffer += "\n"; return; }
            if (name === "TAB") { pasteBuffer += "\t"; return; }
            if (data.isCharacter) { pasteBuffer += name; return; }
            return;
        }

        if (confirmState)
        {
            if (name === "ENTER" || name === "KP_ENTER")
            {
                const resolve = confirmState.resolve;
                confirmState = null;
                resolve(true);
                render();
            }
            else if (name === "ESCAPE")
            {
                const resolve = confirmState.resolve;
                confirmState = null;
                resolve(false);
                render();
            }
            return;
        }

        if (choiceState)
        {
            switch (name)
            {
                case "UP":
                    choiceState.selectedIndex = choiceState.selectedIndex === 0
                        ? choiceState.items.length - 1
                        : choiceState.selectedIndex - 1;
                    render();
                    return;
                case "DOWN":
                    choiceState.selectedIndex = (choiceState.selectedIndex + 1) % choiceState.items.length;
                    render();
                    return;
                case "ENTER":
                case "KP_ENTER":
                {
                    const selectedItem = choiceState.items[choiceState.selectedIndex] ?? null;
                    const resolve = choiceState.resolve;
                    choiceState = null;
                    resolve(selectedItem?.value ?? null);
                    render();
                    return;
                }
                case "ESCAPE":
                {
                    const resolve = choiceState.resolve;
                    choiceState = null;
                    resolve(null);
                    render();
                    return;
                }
                default:
                    return;
            }
        }

        if (name === "CTRL_C")
        {
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
                render();
            }
            return;
        }

        if (isShiftEnter(data.code))
        {
            state.value = `${state.value.slice(0, state.cursor)}\n${state.value.slice(state.cursor)}`;
            state.cursor += 1;
            render();
            if (!renderEnabled) queueCallbacks.onValueChange?.(state.value);
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
                submit(state.value);
                return;
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
                render();
                if (!renderEnabled) queueCallbacks.onValueChange?.(state.value);
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
                render();
                if (!renderEnabled) queueCallbacks.onValueChange?.(state.value);
                return;
            }
            case "LEFT":
            {
                if (state.cursor === 0) return;
                const sentL = getSentinelBefore(state.value, state.cursor);
                if (sentL) { state.cursor = sentL.start; render(); return; }
                state.cursor -= 1;
                render();
                return;
            }
            case "RIGHT":
            {
                if (state.cursor >= state.value.length) return;
                const sentR = getSentinelAfter(state.value, state.cursor);
                if (sentR) { state.cursor = sentR.end; render(); return; }
                state.cursor += 1;
                render();
                return;
            }
            case "HOME":
                state.cursor = getLineStart(state.value, state.cursor);
                render();
                return;
            case "END":
                state.cursor = getLineEnd(state.value, state.cursor);
                render();
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
                    render();
                    return;
                }
                // Command autocomplete: cycle through matching commands when input starts with /
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
                            render();
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
                        render();
                        return;
                    }
                    // History navigation: only on single-line input or when cursor is on the first row
                    const { row } = getCursorMetrics(state.value, state.cursor);
                    if (row === 0 && history.length > 0)
                    {
                        if (historyIndex === -1) historyDraft = state.value;
                        historyIndex = Math.min(historyIndex + 1, history.length - 1);
                        state.value = history[history.length - 1 - historyIndex] ?? "";
                        state.cursor = state.value.length;
                        render();
                        return;
                    }
                }
                state.cursor = getPreviousLineCursor(state.value, state.cursor);
                render();
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
                        render();
                        return;
                    }
                    // History navigation: navigate forward or restore draft
                    const { row } = getCursorMetrics(state.value, state.cursor);
                    const lineCount = splitLines(state.value).length;
                    if (historyIndex >= 0 && row === lineCount - 1)
                    {
                        historyIndex -= 1;
                        state.value = historyIndex < 0
                            ? historyDraft
                            : (history[history.length - 1 - historyIndex] ?? "");
                        state.cursor = state.value.length;
                        render();
                        return;
                    }
                }
                state.cursor = getNextLineCursor(state.value, state.cursor);
                render();
                return;
            }
            default:
                return;
        }
    };

    const close = (): void =>
    {
        activeDriver?.offKey(onKey);
        activeDriver?.showCursor();
        activeDriver?.releaseInput();
    };

    const start = (commands: Map<string, Command>): void =>
    {
        activeCommands = commands;
        getDriver().then((driver) =>
        {
            driver.grabInput();
            driver.hideCursor();
            driver.onKey(onKey);
            render();
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
        render();
    };

    const setQueueSize = (size: number): void =>
    {
        if (queueSize === size) return;
        queueSize = size;
        if (renderEnabled) render();
    };

    let renderEnabled = true;

    const setRenderEnabled = (enabled: boolean): void =>
    {
        if (renderEnabled === enabled) return;
        renderEnabled = enabled;
        if (!enabled)
        {
            clearPreviousRender();
            lastRenderLineCount = 0;
            lastCursorRow = 0;
        }
        else
        {
            render();
        }
    };

    let queueCallbacks: QueueCallbacks = {};

    const setQueueCallbacks = (callbacks: QueueCallbacks): void =>
    {
        queueCallbacks = callbacks;
    };

    let getStatusLine: () => string = () => "";

    const setStatusLine = (getter: () => string): void =>
    {
        getStatusLine = getter;
    };

    const choose = (title: string, items: TerminalChoiceItem[]): Promise<string | null> =>
    {
        if (items.length === 0) return Promise.resolve(null);
        if (choiceState)
        {
            choiceState.resolve(null);
        }

        choiceState = {
            title,
            items,
            selectedIndex: 0,
            resolve: () => undefined,
        };

        const promise = new Promise<string | null>((resolve) =>
        {
            if (!choiceState) return resolve(null);
            choiceState.resolve = resolve;
        });

        render();
        return promise;
    };

    const confirm = (message: string): Promise<boolean> =>
    {
        if (confirmState)
        {
            confirmState.resolve(false);
        }

        confirmState = {
            message,
            resolve: () => undefined,
        };

        const promise = new Promise<boolean>((resolve) =>
        {
            if (!confirmState) return resolve(false);
            confirmState.resolve = resolve;
        });

        render();
        return promise;
    };

    return { start, onSubmit, setMode, setQueueSize, setRenderEnabled, setQueueCallbacks, setStatusLine, choose, confirm, close };
}
