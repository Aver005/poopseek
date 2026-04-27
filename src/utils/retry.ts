import { logger } from "@/logger";

export interface RetryConfig
{
    maxAttempts: number;
    baseDelayMs: number;
    maxDelayMs: number;
    retryableErrors: string[];
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
    maxAttempts: 3,
    baseDelayMs: 1000,
    maxDelayMs: 10_000,
    retryableErrors: ["ECONNRESET", "ETIMEDOUT", "429", "500", "502", "503"],
};

function isRetryable(error: unknown, retryableErrors: string[]): boolean
{
    if (!(error instanceof Error)) return false;
    const msg = error.message;
    return retryableErrors.some((code) => msg.includes(code));
}

function delay(ms: number): Promise<void>
{
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withRetry<T>(
    fn: () => Promise<T>,
    config: Partial<RetryConfig> = {},
): Promise<T>
{
    const cfg = { ...DEFAULT_RETRY_CONFIG, ...config };
    let lastError: unknown;

    for (let attempt = 1; attempt <= cfg.maxAttempts; attempt += 1)
    {
        try
        {
            return await fn();
        }
        catch (error)
        {
            lastError = error;

            if (!isRetryable(error, cfg.retryableErrors) || attempt === cfg.maxAttempts)
            {
                throw error;
            }

            const backoff = Math.min(
                cfg.baseDelayMs * 2 ** (attempt - 1),
                cfg.maxDelayMs,
            );
            logger.warn(
                `Attempt ${attempt}/${cfg.maxAttempts} failed, retrying in ${backoff}ms:`,
                error instanceof Error ? error.message : error,
            );
            await delay(backoff);
        }
    }

    throw lastError;
}
