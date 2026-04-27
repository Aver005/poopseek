type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";

const LEVEL_ORDER: Record<LogLevel, number> = {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3,
};

function getConfiguredLevel(): LogLevel
{
    const raw = process.env.LOG_LEVEL?.toUpperCase();
    if (raw && raw in LEVEL_ORDER) return raw as LogLevel;
    return "INFO";
}

function log(level: LogLevel, args: unknown[]): void
{
    if (LEVEL_ORDER[level] < LEVEL_ORDER[getConfiguredLevel()]) return;

    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${level}]`;

    if (level === "ERROR")
    {
        console.error(prefix, ...args);
    }
    else if (level === "WARN")
    {
        console.warn(prefix, ...args);
    }
    else
    {
        console.log(prefix, ...args);
    }
}

export const logger = {
    debug: (...args: unknown[]) => log("DEBUG", args),
    info: (...args: unknown[]) => log("INFO", args),
    warn: (...args: unknown[]) => log("WARN", args),
    error: (...args: unknown[]) => log("ERROR", args),
};
