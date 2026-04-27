import { describe, it, expect, vi, afterEach } from "vitest";
import { withRetry, DEFAULT_RETRY_CONFIG } from "@/utils/retry";

afterEach(() => {
    vi.useRealTimers();
});

describe("withRetry", () => {
    it("returns value on first success", async () => {
        const fn = vi.fn().mockResolvedValue("ok");
        const result = await withRetry(fn);
        expect(result).toBe("ok");
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it("retries on retryable error and succeeds", async () => {
        vi.useFakeTimers();
        const fn = vi
            .fn()
            .mockRejectedValueOnce(new Error("ECONNRESET connection reset"))
            .mockResolvedValue("ok");

        const promise = withRetry(fn, { baseDelayMs: 100, maxDelayMs: 1000 });
        await vi.runAllTimersAsync();
        expect(await promise).toBe("ok");
        expect(fn).toHaveBeenCalledTimes(2);
    });

    it("throws immediately for non-retryable errors (400)", async () => {
        const fn = vi.fn().mockRejectedValue(new Error("400 Bad Request"));
        await expect(withRetry(fn)).rejects.toThrow("400 Bad Request");
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it("throws immediately for non-retryable errors (401)", async () => {
        const fn = vi.fn().mockRejectedValue(new Error("401 Unauthorized"));
        await expect(withRetry(fn)).rejects.toThrow("401 Unauthorized");
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it("throws after maxAttempts retries", async () => {
        vi.useFakeTimers();
        const fn = vi.fn().mockRejectedValue(new Error("ETIMEDOUT timeout"));
        const promise = withRetry(fn, { maxAttempts: 3, baseDelayMs: 10, maxDelayMs: 100 });
        // Attach rejection handler before advancing timers to avoid unhandled rejection
        const rejection = expect(promise).rejects.toThrow("ETIMEDOUT timeout");
        await vi.runAllTimersAsync();
        await rejection;
        expect(fn).toHaveBeenCalledTimes(3);
    });

    it("uses exponential backoff: 1s then 2s", async () => {
        vi.useFakeTimers();
        const fn = vi
            .fn()
            .mockRejectedValueOnce(new Error("429 rate limited"))
            .mockRejectedValueOnce(new Error("429 rate limited"))
            .mockResolvedValue("done");

        const promise = withRetry(fn, { baseDelayMs: 1000, maxDelayMs: 10_000, maxAttempts: 3 });

        expect(fn).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(1000);
        expect(fn).toHaveBeenCalledTimes(2);
        await vi.advanceTimersByTimeAsync(2000);
        expect(fn).toHaveBeenCalledTimes(3);

        expect(await promise).toBe("done");
    });

    it("caps backoff at maxDelayMs", async () => {
        vi.useFakeTimers();
        const fn = vi
            .fn()
            .mockRejectedValueOnce(new Error("500 server error"))
            .mockResolvedValue("ok");

        const promise = withRetry(fn, { baseDelayMs: 10_000, maxDelayMs: 100, maxAttempts: 2 });
        await vi.advanceTimersByTimeAsync(100);
        expect(await promise).toBe("ok");
    });

    it("retries on 503 error code in message", async () => {
        vi.useFakeTimers();
        const fn = vi
            .fn()
            .mockRejectedValueOnce(new Error("Service unavailable 503"))
            .mockResolvedValue("recovered");

        const promise = withRetry(fn, { baseDelayMs: 10 });
        await vi.runAllTimersAsync();
        expect(await promise).toBe("recovered");
    });

    it("default config has correct retryable errors", () => {
        expect(DEFAULT_RETRY_CONFIG.retryableErrors).toContain("ECONNRESET");
        expect(DEFAULT_RETRY_CONFIG.retryableErrors).toContain("ETIMEDOUT");
        expect(DEFAULT_RETRY_CONFIG.retryableErrors).toContain("429");
        expect(DEFAULT_RETRY_CONFIG.retryableErrors).toContain("500");
        expect(DEFAULT_RETRY_CONFIG.retryableErrors).toContain("502");
        expect(DEFAULT_RETRY_CONFIG.retryableErrors).toContain("503");
    });
});
