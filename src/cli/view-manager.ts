import { stdout as output } from "node:process";

const ANSI_PATTERN = /\x1b\[[0-9;?]*[ -/]*[@-~]/g;

type ScreenCursor = {
    row: number;
    col: number;
};

type ScreenState = ScreenCursor & {
    pendingWrap: boolean;
};

function stripAnsi(value: string): string
{
    return value.replace(ANSI_PATTERN, "");
}

function getTerminalWidth(): number
{
    return Math.max(1, output.columns ?? 80);
}

function advanceCursor(state: ScreenState, columns: number, width: number): ScreenState
{
    if (columns <= 0) return state;

    let nextState = state;

    for (let index = 0; index < columns; index += 1)
    {
        if (nextState.pendingWrap)
        {
            nextState = {
                row: nextState.row + 1,
                col: 0,
                pendingWrap: false,
            };
        }

        if (nextState.col >= width - 1)
        {
            nextState = {
                row: nextState.row,
                col: width - 1,
                pendingWrap: true,
            };
            continue;
        }

        nextState = {
            row: nextState.row,
            col: nextState.col + 1,
            pendingWrap: false,
        };
    }

    return nextState;
}

function advanceLine(state: ScreenState): ScreenState
{
    return {
        row: state.row + 1,
        col: 0,
        pendingWrap: false,
    };
}

function getRenderedMetrics(
    lines: string[],
    cursorLineIndex: number,
    cursorCol: number,
): {
    totalRows: number;
    cursor: ScreenCursor;
}
{
    const width = getTerminalWidth();
    const lastLineIndex = Math.max(0, lines.length - 1);
    const safeCursorLineIndex = Math.max(0, Math.min(cursorLineIndex, lastLineIndex));
    const normalizedCursorCol = Math.max(0, cursorCol);

    let cursor: ScreenCursor = { row: 0, col: 0 };
    let current: ScreenState = { row: 0, col: 0, pendingWrap: false };

    for (let index = 0; index < lines.length; index += 1)
    {
        const visibleLine = stripAnsi(lines[index] ?? "");
        const visibleLength = visibleLine.length;

        if (index < safeCursorLineIndex)
        {
            current = advanceCursor(current, visibleLength, width);
            current = advanceLine(current);
            continue;
        }

        if (index === safeCursorLineIndex)
        {
            const cursorState = advanceCursor(current, normalizedCursorCol, width);
            cursor = { row: cursorState.row, col: cursorState.col };
        }

        current = advanceCursor(current, visibleLength, width);

        if (index < lines.length - 1)
        {
            current = advanceLine(current);
        }
    }

    return {
        totalRows: current.row + 1,
        cursor,
    };
}

export type ViewRenderResult = {
    lines: string[];
    cursorRow: number;
    cursorCol: number;
};

export type TerminalKeyData = {
    code?: string;
    isCharacter?: boolean;
};

export type TerminalKeyHandler = (name: string, matches: string[], data: TerminalKeyData) => void;

export type TerminalDriver = {
    grabInput: () => void;
    releaseInput: () => void;
    hideCursor: () => void;
    showCursor: () => void;
    onKey: (listener: TerminalKeyHandler) => void;
    offKey: (listener: TerminalKeyHandler) => void;
};

export interface View {
    readonly id: string;
    onMount?(manager: ViewManager): void | Promise<void>;
    onUnmount?(): void | Promise<void>;
    onKey(key: string, data: TerminalKeyData): void | Promise<void>;
    render(): ViewRenderResult;
}

export class ViewManager {
    private readonly _stack: View[] = [];
    private _lastLineCount = 0;
    private _lastCursorRow = 0;
    private _renderScheduled = false;
    private _suspended = false;
    private _driver: TerminalDriver | null = null;

    private readonly _handleKey = (name: string, _matches: string[], data: TerminalKeyData): void => {
        this._stack.at(-1)?.onKey(name, data);
    };

    get current(): View | undefined {
        return this._stack.at(-1);
    }

    get suspended(): boolean {
        return this._suspended;
    }

    setDriver(driver: TerminalDriver): void {
        this._driver = driver;
        driver.onKey(this._handleKey);
    }

    initBaseView(view: View): void {
        this._stack.push(view);
        view.onMount?.(this);
    }

    async push(view: View): Promise<void> {
        await this._stack.at(-1)?.onUnmount?.();
        this._stack.push(view);
        await view.onMount?.(this);
        this.invalidate();
    }

    async pop(): Promise<void> {
        if (this._stack.length <= 1) return;
        this._clearZone();
        await this._stack.pop()?.onUnmount?.();
        await this._stack.at(-1)?.onMount?.(this);
        this.invalidate();
    }

    async replace(view: View): Promise<void> {
        await this._stack.pop()?.onUnmount?.();
        this._stack.push(view);
        await view.onMount?.(this);
        this.invalidate();
    }

    invalidate(): void {
        if (this._renderScheduled || this._suspended) return;
        this._renderScheduled = true;
        process.nextTick(() => {
            this._renderScheduled = false;
            this._doRender();
        });
    }

    renderNow(): void {
        if (this._suspended) return;
        this._renderScheduled = false;
        this._doRender();
    }

    suspend(): void {
        if (this._suspended) return;
        this._suspended = true;
        this._clearZone();
    }

    resume(): void {
        if (!this._suspended) return;
        this._suspended = false;
        this.invalidate();
    }

    destroy(): void {
        this._clearZone();
        if (this._driver) {
            this._driver.offKey(this._handleKey);
            this._driver.releaseInput();
            this._driver.showCursor();
            this._driver = null;
        }
    }

    private _clearZone(): void {
        if (this._lastLineCount === 0) return;
        output.write("\r");
        if (this._lastCursorRow > 0) output.write(`\x1b[${this._lastCursorRow}A`);
        for (let i = 0; i < this._lastLineCount; i++) {
            output.write("\x1b[2K");
            if (i < this._lastLineCount - 1) output.write("\x1b[1B\r");
        }
        if (this._lastLineCount > 1) output.write(`\x1b[${this._lastLineCount - 1}A`);
        output.write("\r");
        this._lastLineCount = 0;
        this._lastCursorRow = 0;
    }

    private _doRender(): void {
        if (this._suspended) return;
        const view = this._stack.at(-1);
        if (!view) return;

        const result = view.render();
        const metrics = getRenderedMetrics(result.lines, result.cursorRow, result.cursorCol);

        this._clearZone();
        output.write(result.lines.join("\n"));

        const linesUpFromBottom = metrics.totalRows - 1 - metrics.cursor.row;
        if (linesUpFromBottom > 0) output.write(`\x1b[${linesUpFromBottom}A`);
        output.write("\r");
        if (metrics.cursor.col > 0) output.write(`\x1b[${metrics.cursor.col}C`);

        this._lastLineCount = metrics.totalRows;
        this._lastCursorRow = metrics.cursor.row;
    }
}
