import { colors } from '@/cli/colors';
import type { View, ViewManager, ViewRenderResult, TerminalKeyData } from '@/cli/view-manager';

/**
 * Simple loading view with animated spinner and rotating status messages.
 * It runs its own interval timer; when the view is popped the timer is cleared.
 */
export class LoadingView implements View {
    readonly id = 'loading';
    private _spinnerIndex = 0;
    private _statusIndex = 0;
    private _timer: ReturnType<typeof setInterval> | null = null;
    private readonly _statuses: string[];
    private readonly _spinnerFrames = ['⠋','⠙','⠹','⠸','⠼','⠴','⠦','⠧','⠇','⠏'];

    constructor(statuses: string[], private readonly _interval = 150) {
        this._statuses = statuses;
    }

    onKey(_: string, __: TerminalKeyData): void {}

    onMount(manager: ViewManager): void {
        this._timer = setInterval(() => {
            this._spinnerIndex = (this._spinnerIndex + 1) % this._spinnerFrames.length;
            this._statusIndex = (this._statusIndex + 1) % this._statuses.length;
            manager.invalidate();
        }, this._interval);
    }

    async onUnmount(): Promise<void> {
        if (this._timer) clearInterval(this._timer);
    }

    render(): ViewRenderResult {
        const spinner = colors.cyan(this._spinnerFrames[this._spinnerIndex]!);
        const status = colors.yellow(this._statuses[this._statusIndex]!);
        const line = `${spinner} ${status}`;
        return { lines: [line], cursorRow: 0, cursorCol: line.length };
    }
}
