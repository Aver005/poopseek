import { stdout as output } from "node:process";
import terminalKit from "terminal-kit";
import type { Command } from "@/commands/types";
import { colors } from "@/cli/colors";
import { getCommandHintLines } from "@/cli/command-hints";

type TerminalInputController = {
    readUserInput: (commands: Map<string, Command>) => Promise<string>;
    close: () => void;
};

type TerminalKeyData = {
    code?: string;
    isCharacter?: boolean;
};

const PROMPT_PREFIX = `${colors.magenta(">")} `;
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
    return {
        row,
        column: lastLine.length,
    };
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

function buildRenderedBlock(value: string, cursor: number, commands: Map<string, Command>): string
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

    return inputLines.map((line, index) =>
        `${index === 0 ? PROMPT_PREFIX : CONTINUATION_PREFIX}${line}`
    ).concat((() =>
    {
        const hintLines = getCommandHintLines(value, commands);
        if (hintLines.length === 0)
        {
            return [];
        }

        return [
            ...hintLines,
        ];
    })()).join("\n");
}

export function createTerminalInput(): TerminalInputController
{
    const term = terminalKit.terminal;
    let activeCleanup: (() => void) | null = null;
    let lastRenderLineCount = 0;
    let lastCursorRow = 0;

    const close = (): void =>
    {
        activeCleanup?.();
        activeCleanup = null;
        term.hideCursor(false);
        term.grabInput(false);
    };

    const readUserInput = async (commands: Map<string, Command>): Promise<string> =>
    {
        close();

        return await new Promise<string>((resolve) =>
        {
            const state = {
                value: "",
                cursor: 0,
            };

            let settled = false;

            const clearPreviousRender = (): void =>
            {
                if (lastRenderLineCount === 0) return;

                output.write("\r");
                if (lastCursorRow > 0)
                {
                    output.write(`\x1b[${lastCursorRow}A`);
                }

                for (let index = 0; index < lastRenderLineCount; index += 1)
                {
                    output.write("\x1b[2K");
                    if (index < lastRenderLineCount - 1)
                    {
                        output.write("\x1b[1B\r");
                    }
                }

                if (lastRenderLineCount > 1)
                {
                    output.write(`\x1b[${lastRenderLineCount - 1}A`);
                }
                output.write("\r");
            };

            const render = (): void =>
            {
                const renderedBlock = buildRenderedBlock(state.value, state.cursor, commands);
                const renderedLines = renderedBlock.split("\n");
                const renderedLineCount = renderedLines.length;
                const cursorMetrics = getCursorMetrics(state.value, state.cursor);
                const horizontalOffset = cursorMetrics.row === 0
                    ? PROMPT_WIDTH + cursorMetrics.column
                    : CONTINUATION_WIDTH + cursorMetrics.column;
                const linesUpFromBottom = renderedLineCount - 1 - cursorMetrics.row;

                clearPreviousRender();
                output.write(renderedBlock);
                if (linesUpFromBottom > 0)
                {
                    output.write(`\x1b[${linesUpFromBottom}A`);
                }
                output.write("\r");
                if (horizontalOffset > 0)
                {
                    output.write(`\x1b[${horizontalOffset}C`);
                }

                lastRenderLineCount = renderedLineCount;
                lastCursorRow = cursorMetrics.row;
            };

            const finish = (value: string): void =>
            {
                if (settled) return;
                settled = true;
                cleanup();
                render();
                output.write("\n");
                lastRenderLineCount = 0;
                lastCursorRow = 0;
                resolve(value.trim());
            };

            const onKey = (name: string, _matches: string[], data: TerminalKeyData): void =>
            {
                if (name === "CTRL_C")
                {
                    finish("/exit");
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
                    const previousCharacter = state.cursor > 0
                        ? state.value.at(state.cursor - 1)
                        : undefined;

                    if (name === "n" && previousCharacter === "\\")
                    {
                        state.value = [
                            state.value.slice(0, state.cursor - 1),
                            "\n",
                            state.value.slice(state.cursor),
                        ].join("");
                        render();
                        return;
                    }

                    state.value = [
                        state.value.slice(0, state.cursor),
                        name,
                        state.value.slice(state.cursor),
                    ].join("");
                    state.cursor += name.length;
                    render();
                    return;
                }

                switch (name)
                {
                    case "ENTER":
                    case "KP_ENTER":
                        finish(state.value);
                        return;
                    case "BACKSPACE":
                        if (state.cursor === 0) return;
                        state.value = [
                            state.value.slice(0, state.cursor - 1),
                            state.value.slice(state.cursor),
                        ].join("");
                        state.cursor -= 1;
                        render();
                        return;
                    case "DELETE":
                        if (state.cursor >= state.value.length) return;
                        state.value = [
                            state.value.slice(0, state.cursor),
                            state.value.slice(state.cursor + 1),
                        ].join("");
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
                    case "UP":
                        state.cursor = getPreviousLineCursor(state.value, state.cursor);
                        render();
                        return;
                    case "DOWN":
                        state.cursor = getNextLineCursor(state.value, state.cursor);
                        render();
                        return;
                    default:
                        return;
                }
            };

            const cleanup = (): void =>
            {
                if (activeCleanup !== cleanup) return;
                term.off("key", onKey);
                term.hideCursor(false);
                term.grabInput(false);
                activeCleanup = null;
            };

            activeCleanup = cleanup;
            term.grabInput(true);
            term.hideCursor();
            render();
            term.on("key", onKey);
        });
    };

    return {
        readUserInput,
        close,
    };
}
