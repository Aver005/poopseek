export function toStringValue(value: unknown): string | null
{
    return typeof value === "string" ? value : null;
}

export function toBooleanValue(value: unknown, fallback: boolean): boolean
{
    return typeof value === "boolean" ? value : fallback;
}

export function toNumberValue(value: unknown): number | null
{
    return typeof value === "number" && Number.isFinite(value) ? value : null;
}
