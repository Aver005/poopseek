export type CallOptionsStore = {
    getSearchEnabled(): boolean;
    setSearchEnabled(enabled: boolean): void;
    getLocalSearchEnabled(): boolean;
    setLocalSearchEnabled(enabled: boolean): void;
    getThinkingEnabled(): boolean;
    setThinkingEnabled(enabled: boolean): void;
    getPoetEnabled(): boolean;
    setPoetEnabled(enabled: boolean): void;
    getActiveRoleName(): string | null;
    setActiveRoleName(name: string | null): void;
    getRequestDelayMs(): number;
    setRequestDelayMs(ms: number): void;
};

export function createCallOptionsStore(): CallOptionsStore
{
    let searchEnabled = false;
    let localSearchEnabled = false;
    let thinkingEnabled = false;
    let poetEnabled = false;
    let activeRoleName: string | null = null;
    let requestDelayMs = 0;
    return {
        getSearchEnabled: () => searchEnabled,
        setSearchEnabled: (enabled) => { searchEnabled = enabled; },
        getLocalSearchEnabled: () => localSearchEnabled,
        setLocalSearchEnabled: (enabled) => { localSearchEnabled = enabled; },
        getThinkingEnabled: () => thinkingEnabled,
        setThinkingEnabled: (enabled) => { thinkingEnabled = enabled; },
        getPoetEnabled: () => poetEnabled,
        setPoetEnabled: (enabled) => { poetEnabled = enabled; },
        getActiveRoleName: () => activeRoleName,
        setActiveRoleName: (name) => { activeRoleName = name; },
        getRequestDelayMs: () => requestDelayMs,
        setRequestDelayMs: (ms) => { requestDelayMs = ms; },
    };
}
