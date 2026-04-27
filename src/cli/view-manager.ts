import { stdout as output } from "node:process";

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
        const view = this._stack.at(-1);
        if (!view) return;

        const result = view.render();
        const lineCount = result.lines.length;

        this._clearZone();
        output.write(result.lines.join("\n"));

        const linesUpFromBottom = lineCount - 1 - result.cursorRow;
        if (linesUpFromBottom > 0) output.write(`\x1b[${linesUpFromBottom}A`);
        output.write("\r");
        if (result.cursorCol > 0) output.write(`\x1b[${result.cursorCol}C`);

        this._lastLineCount = lineCount;
        this._lastCursorRow = result.cursorRow;
    }
}
