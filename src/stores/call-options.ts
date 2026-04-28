export type CallOptionsStore = {
    getSearchEnabled(): boolean;
    setSearchEnabled(enabled: boolean): void;
    getThinkingEnabled(): boolean;
    setThinkingEnabled(enabled: boolean): void;
    getActiveRoleName(): string | null;
    setActiveRoleName(name: string | null): void;
};

export function createCallOptionsStore(): CallOptionsStore
{
    let searchEnabled = false;
    let thinkingEnabled = false;
    let activeRoleName: string | null = null;
    return {
        getSearchEnabled: () => searchEnabled,
        setSearchEnabled: (enabled) => { searchEnabled = enabled; },
        getThinkingEnabled: () => thinkingEnabled,
        setThinkingEnabled: (enabled) => { thinkingEnabled = enabled; },
        getActiveRoleName: () => activeRoleName,
        setActiveRoleName: (name) => { activeRoleName = name; },
    };
}
