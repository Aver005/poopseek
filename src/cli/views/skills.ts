import type { View, ViewManager, ViewRenderResult, TerminalKeyData } from "@/cli/view-manager";
import { colors } from "@/cli/colors";

const VISIBLE_COUNT = 5;
const SEPARATOR = colors.dim("─".repeat(44));

type SkillItem = { name: string; description: string };

type SkillsViewDeps = {
    getSkills: () => SkillItem[];
    isActive: (name: string) => boolean;
    activate: (name: string) => void;
    deactivate: (name: string) => void;
    onClose: () => void;
};

export class SkillsView implements View {
    readonly id = "skills";
    private _manager!: ViewManager;
    private _selectedIndex = 0;
    private _scrollOffset = 0;
    private readonly _deps: SkillsViewDeps;

    constructor(deps: SkillsViewDeps) {
        this._deps = deps;
    }

    onMount(manager: ViewManager): void {
        this._manager = manager;
    }

    onKey(key: string, _data: TerminalKeyData): void {
        switch (key) {
            case "UP":
                this._move(-1);
                return;
            case "DOWN":
                this._move(1);
                return;
            case "ENTER":
            case " ":
                this._toggle();
                return;
            case "ESCAPE":
            case "CTRL_C":
                this._close();
                return;
        }
    }

    private _move(delta: number): void {
        const skills = this._deps.getSkills();
        if (skills.length === 0) return;
        this._selectedIndex = Math.max(0, Math.min(skills.length - 1, this._selectedIndex + delta));
        if (this._selectedIndex < this._scrollOffset) {
            this._scrollOffset = this._selectedIndex;
        }
        else if (this._selectedIndex >= this._scrollOffset + VISIBLE_COUNT) {
            this._scrollOffset = this._selectedIndex - VISIBLE_COUNT + 1;
        }
        this._manager.invalidate();
    }

    private _toggle(): void {
        const skills = this._deps.getSkills();
        const name = skills[this._selectedIndex]?.name;
        if (!name) return;
        if (this._deps.isActive(name)) {
            this._deps.deactivate(name);
        }
        else {
            this._deps.activate(name);
        }
        this._manager.invalidate();
    }

    private _close(): void {
        const onClose = this._deps.onClose;
        this._manager.pop();
        onClose();
    }

    render(): ViewRenderResult {
        const skills = this._deps.getSkills();
        const activeCount = skills.filter((s) => this._deps.isActive(s.name)).length;

        const lines: string[] = [];

        lines.push(colors.cyan(`Навыки`) + colors.dim(` (${activeCount}/${skills.length} активных)`));
        lines.push(SEPARATOR);

        if (skills.length === 0) {
            lines.push(colors.dim("  Навыки не найдены."));
        }
        else {
            const end = Math.min(this._scrollOffset + VISIBLE_COUNT, skills.length);
            for (let i = this._scrollOffset; i < end; i++) {
                const skill = skills[i]!;
                const selected = i === this._selectedIndex;
                const active = this._deps.isActive(skill.name);
                const dot = active ? colors.green("●") : colors.dim("○");
                const nameStr = selected
                    ? (active ? colors.green(skill.name) : colors.yellow(skill.name))
                    : (active ? colors.green(skill.name) : skill.name);
                const cursor = selected ? colors.yellow("›") : " ";
                lines.push(` ${cursor} ${dot} ${nameStr}`);
            }

            if (skills.length > VISIBLE_COUNT) {
                lines.push(colors.dim(`  (${this._scrollOffset + 1}–${end} из ${skills.length})`));
            }
        }

        lines.push(SEPARATOR);
        lines.push(colors.dim("↑↓ — навигация  Enter/Пробел — вкл/выкл  Esc — выход"));

        return { lines, cursorRow: lines.length - 1, cursorCol: 0 };
    }
}
