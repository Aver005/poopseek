export type UnknownRecord = Record<string, unknown>;

export function isRecord(value: unknown): value is UnknownRecord 
{
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function getRecord(value: unknown, key: string): UnknownRecord | null 
{
    if (!isRecord(value)) return null;
    const nested = value[key];
    if (!isRecord(nested)) return null;
    return nested;
}

export function getString(value: unknown, key: string): string | null 
{
    if (!isRecord(value)) return null;
    const nested = value[key];
    if (typeof nested !== "string") return null;
    return nested;
}

export function getNumber(value: unknown, key: string): number | null 
{
    if (!isRecord(value)) return null;
    const nested = value[key];
    if (typeof nested !== "number" || !Number.isFinite(nested)) return null;
    return nested;
}
