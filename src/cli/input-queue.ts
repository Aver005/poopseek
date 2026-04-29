export interface InputQueue
{
    waitForNext(): Promise<string>;
    hasPendingWaiter(): boolean;
    resolveWaiter(value: string): void;
    enqueue(value: string): void;
    clear(): void;
    readonly length: number;
    itemAt(index: number): string | undefined;
    itemsSnapshot(): readonly string[];
}

export function createInputQueue(onSync: (size: number) => void): InputQueue
{
    const items: string[] = [];
    let pendingWaiter: ((value: string) => void) | null = null;

    return {
        waitForNext(): Promise<string>
        {
            if (items.length > 0)
            {
                const value = items.shift()!;
                onSync(items.length);
                return Promise.resolve(value);
            }
            return new Promise((resolve) =>
            {
                pendingWaiter = resolve;
            });
        },

        hasPendingWaiter(): boolean
        {
            return pendingWaiter !== null;
        },

        resolveWaiter(value: string): void
        {
            if (!pendingWaiter) return;
            const r = pendingWaiter;
            pendingWaiter = null;
            r(value);
        },

        enqueue(value: string): void
        {
            items.push(value);
            onSync(items.length);
        },

        clear(): void
        {
            items.length = 0;
            onSync(0);
        },

        get length()
        {
            return items.length;
        },

        itemAt(index: number)
        {
            return items[index];
        },

        itemsSnapshot()
        {
            return items as readonly string[];
        },
    };
}
