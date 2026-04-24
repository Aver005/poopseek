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
    onStart?: () => void;
    onStop?: () => void;
};

type TerminalInputController = {
    start: (commands: Map<string, Command>) => void;
    onSubmit: (handler: (value: string) => void) => () => void;
    setMode: (mode: TerminalInputMode) => void;
    setQueueSize: (size: number) => void;
    setRenderEnabled: (enabled: boolean) => void;
    setQueueCallbacks: (callbacks: QueueCallbacks) => void;
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
        if (key?.name === "left") return { name: "LEFT", data: { code: sequence, isCharacter: false } };
        if (key?.name === "right") return { name: "RIGHT", data: { code: sequence, isCharacter: false } };
        if (key?.name === "up") return { name: "UP", data: { code: sequence, isCharacter: false } };
        if (key?.name === "down") return { name: "DOWN", data: { code: sequence, isCharacter: false } };
        if (key?.name === "home") return { name: "HOME", data: { code: sequence, isCharacter: false } };
        if (key?.name === "end") return { name: "END", data: { code: sequence, isCharacter: false } };
        if (key?.name === "tab") return { name: "TAB", data: { code: sequence, isCharacter: false } };
        return { name: char, data: { code: sequence, isCharacter: char.length > 0 } };
    };

    return {
        grabInput: (): void =>
        {
            if (!input.isTTY) return;
            input.setRawMode?.(true);
            input.resume();
        },
        releaseInput: (): void =>
        {
            if (!input.isTTY) return;
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
            grabInput: (): void => { term.grabInput(true); },
            releaseInput: (): void => { term.grabInput(false); },
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
        `${index === 0 ? firstLinePrefix : CONTINUATION_PREFIX}${formatInputLineWithMentions(line, workspaceRoot)}`
    ).concat((() =>
    {
        if (mode === "queue") return [];
        const fileHintLines = getFileHintLines(fileCompletionState, fileSelectionIndex);
        const hintLines = fileHintLines.length > 0
            ? fileHintLines
            : getCommandHintLines(value, commands);
        if (hintLines.length === 0) return [];
        return [colors.dim("Подсказки:"), ...hintLines];
    })()).join("\n");
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

    const submitHandlers = new Set<(value: string) => void>();

    const state = {
        value: "",
        cursor: 0,
    };

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
        const activeFileCompletionState = getActiveFileCompletionState();
        const renderedBlock = buildRenderedBlock(
            state.value,
            state.cursor,
            mode,
            queueSize,
            activeCommands,
            getWorkspaceRoot(),
            activeFileCompletionState,
            fileSelectionIndex,
        );
        const renderedLines = renderedBlock.split("\n");
        const renderedLineCount = renderedLines.length;
        const cursorMetrics = getCursorMetrics(state.value, state.cursor);
        const horizontalOffset = cursorMetrics.row === 0
            ? PROMPT_WIDTH + cursorMetrics.column
            : CONTINUATION_WIDTH + cursorMetrics.column;
        const linesUpFromBottom = renderedLineCount - 1 - cursorMetrics.row;

        clearPreviousRender();
        output.write(renderedBlock);
        if (linesUpFromBottom > 0) output.write(`\x1b[${linesUpFromBottom}A`);
        output.write("\r");
        if (horizontalOffset > 0) output.write(`\x1b[${horizontalOffset}C`);

        lastRenderLineCount = renderedLineCount;
        lastCursorRow = cursorMetrics.row;
    };

    const submit = (value: string): void =>
    {
        clearPreviousRender();
        if (renderEnabled) output.write("\n");
        lastRenderLineCount = 0;
        lastCursorRow = 0;
        state.value = "";
        state.cursor = 0;

        for (const handler of submitHandlers)
        {
            handler(value.trim());
        }

        render();
        if (!renderEnabled) queueCallbacks.onStop?.();
    };

    const onKey = (name: string, _matches: string[], data: TerminalKeyData): void =>
    {
        if (name === "CTRL_C")
        {
            submit("/exit");
            return;
        }

        if (isShiftEnter(data.code))
        {
            state.value = `${state.value.slice(0, state.cursor)}\n${state.value.slice(state.cursor)}`;
            state.cursor += 1;
            render();
            return;
        }

        if (data.isCharacter)
        {
            const wasEmpty = !renderEnabled && state.value.length === 0;
            const previousCharacter = state.cursor > 0 ? state.value.at(state.cursor - 1) : undefined;
            if (name === "n" && previousCharacter === "\\")
            {
                state.value = [state.value.slice(0, state.cursor - 1), "\n", state.value.slice(state.cursor)].join("");
                render();
                return;
            }
            state.value = [state.value.slice(0, state.cursor), name, state.value.slice(state.cursor)].join("");
            state.cursor += name.length;
            render();
            if (wasEmpty) queueCallbacks.onStart?.();
            return;
        }

        switch (name)
        {
            case "ENTER":
            case "KP_ENTER":
                submit(state.value);
                return;
            case "BACKSPACE":
                if (state.cursor === 0) return;
                state.value = [state.value.slice(0, state.cursor - 1), state.value.slice(state.cursor)].join("");
                state.cursor -= 1;
                render();
                return;
            case "DELETE":
                if (state.cursor >= state.value.length) return;
                state.value = [state.value.slice(0, state.cursor), state.value.slice(state.cursor + 1)].join("");
                render();
                return;
            case "LEFT":
                if (state.cursor === 0) return;
                state.cursor -= 1;
                render();
                return;
            case "RIGHT":
                if (state.cursor >= state.value.length) return;
                state.cursor += 1;
                render();
                return;
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
                if (completionState.options.length === 0) return;
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

    return { start, onSubmit, setMode, setQueueSize, setRenderEnabled, setQueueCallbacks, close };
}
