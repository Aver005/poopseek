import { colors } from '@/cli/colors';
import type { View, ViewManager, ViewRenderResult, TerminalKeyData } from '@/cli/view-manager';

const SPINNER_FRAMES = ['⠋','⠙','⠹','⠸','⠼','⠴','⠦','⠧','⠇','⠏'];
const BAR_WIDTH = 28;

export type ProgressReporter = (pct: number) => void;

export class LoadingView implements View {
    readonly id = 'loading';
    private _spinnerIdx = 0;
    private _statusIdx = 0;
    private _progress = 0;
    private _timer: ReturnType<typeof setInterval> | null = null;
    private _setProgress: ProgressReporter | null = null;
    private readonly _statuses: string[];

    constructor(statuses: string[]) {
        this._statuses = statuses;
    }

    /** Call from outside to advance the real progress (0-100). */
    setProgress(pct: number): void {
        this._progress = Math.max(0, Math.min(100, pct));
    }

    onKey(_: string, __: TerminalKeyData): void {}

    onMount(manager: ViewManager): void {
        // Expose a way for run-cli to push progress updates
        this._setProgress = (pct: number) => {
            this._progress = Math.max(0, Math.min(100, pct));
            manager.invalidate();
        };

        this._timer = setInterval(() => {
            this._spinnerIdx = (this._spinnerIdx + 1) % SPINNER_FRAMES.length;
            this._statusIdx = (this._statusIdx + 1) % this._statuses.length;
            manager.invalidate();
        }, 180);
    }

    async onUnmount(): Promise<void> {
        if (this._timer) clearInterval(this._timer);
    }

    /** Called by run-cli to get the progress callback. */
    getProgressReporter(): ProgressReporter | null {
        return this._setProgress;
    }

    render(): ViewRenderResult {
        const spinner = colors.cyan(SPINNER_FRAMES[this._spinnerIdx]!);
        const status = colors.yellow(this._statuses[this._statusIdx]!);
        const bar = this._buildBar();

        const lines = [
            '',
            '',
            '',
            `        ${spinner}  ${status}`,
            '',
            `        ${bar}`,
            '',
            '',
            '',
        ];

        return { lines, cursorRow: 8, cursorCol: 0 };
    }

    private _buildBar(): string {
        const filled = Math.round((this._progress / 100) * BAR_WIDTH);
        const empty = BAR_WIDTH - filled;
        const filledBar = colors.cyan('█'.repeat(filled));
        const emptyBar = colors.dim('░'.repeat(empty));
        const pct = colors.dim(`${this._progress}%`);
        return `[${filledBar}${emptyBar}] ${pct}`;
    }
}
