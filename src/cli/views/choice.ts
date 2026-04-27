import type { View, ViewManager, ViewRenderResult, TerminalKeyData } from "@/cli/view-manager";
import type { TerminalChoiceItem } from "@/cli/terminal-input";
import { colors } from "@/cli/colors";

export class ChoiceView implements View {
    readonly id = "choice";
    private _manager!: ViewManager;
    private readonly _resolve: (value: string | null) => void;
    private _selectedIndex = 0;
    private readonly _title: string;
    private readonly _items: TerminalChoiceItem[];

    constructor(title: string, items: TerminalChoiceItem[], resolve: (value: string | null) => void) {
        this._title = title;
        this._items = items;
        this._resolve = resolve;
    }

    onMount(manager: ViewManager): void {
        this._manager = manager;
    }

    onKey(key: string, _data: TerminalKeyData): void {
        switch (key) {
            case "UP":
                this._selectedIndex = this._selectedIndex === 0
                    ? this._items.length - 1
                    : this._selectedIndex - 1;
                this._manager.invalidate();
                return;
            case "DOWN":
                this._selectedIndex = (this._selectedIndex + 1) % this._items.length;
                this._manager.invalidate();
                return;
            case "ENTER":
            case "KP_ENTER": {
                const value = this._items[this._selectedIndex]?.value ?? null;
                const resolve = this._resolve;
                this._manager.pop();
                resolve(value);
                return;
            }
            case "ESCAPE": {
                const resolve = this._resolve;
                this._manager.pop();
                resolve(null);
                return;
            }
        }
    }

    render(): ViewRenderResult {
        const visibleLimit = 12;
        const startIndex = this._items.length <= visibleLimit
            ? 0
            : Math.min(
                Math.max(0, this._selectedIndex - Math.floor(visibleLimit / 2)),
                this._items.length - visibleLimit,
            );
        const visibleItems = this._items.slice(startIndex, startIndex + visibleLimit);
        const lines: string[] = [
            colors.cyan(this._title),
            colors.dim("Enter - загрузить, Esc - отмена"),
        ];

        for (let i = 0; i < visibleItems.length; i++) {
            const item = visibleItems[i]!;
            const absoluteIndex = startIndex + i;
            const selected = absoluteIndex === this._selectedIndex;
            const marker = selected ? colors.green("›") : colors.dim(" ");
            const label = selected ? colors.green(item.label) : item.label;
            lines.push(`${marker} ${label}`);
            if (item.hint) {
                lines.push(`  ${colors.dim(item.hint)}`);
            }
        }

        if (startIndex > 0 || startIndex + visibleItems.length < this._items.length) {
            lines.push(colors.dim(`Показано ${startIndex + 1}-${startIndex + visibleItems.length} из ${this._items.length}`));
        }

        return { lines, cursorRow: lines.length - 1, cursorCol: 0 };
    }
}
