import type { View, ViewManager, ViewRenderResult, TerminalKeyData } from "@/cli/view-manager";
import { colors } from "@/cli/colors";

export class ConfirmView implements View {
    readonly id = "confirm";
    private _manager!: ViewManager;
    private readonly _resolve: (confirmed: boolean) => void;
    private readonly _message: string;

    constructor(message: string, resolve: (confirmed: boolean) => void) {
        this._message = message;
        this._resolve = resolve;
    }

    onMount(manager: ViewManager): void {
        this._manager = manager;
    }

    onKey(key: string, _data: TerminalKeyData): void {
        if (key === "ENTER" || key === "KP_ENTER") {
            const resolve = this._resolve;
            this._manager.pop();
            resolve(true);
        }
        else if (key === "ESCAPE") {
            const resolve = this._resolve;
            this._manager.pop();
            resolve(false);
        }
    }

    render(): ViewRenderResult {
        return {
            lines: [
                this._message,
                colors.dim("Enter — продолжить  Esc — отмена"),
            ],
            cursorRow: 0,
            cursorCol: 0,
        };
    }
}
