import { describe, it, expect, vi, beforeEach } from "vitest";
import { TokenBucket, checkRateLimit, overrideRateLimit } from "@/utils/rate-limiter";

describe("TokenBucket", () => {
    it("allows consumption within limit", () => {
        const bucket = new TokenBucket({ tokensPerInterval: 3, interval: 60_000 });
        expect(bucket.consume()).toBe(true);
        expect(bucket.consume()).toBe(true);
        expect(bucket.consume()).toBe(true);
    });

    it("blocks consumption when exhausted", () => {
        const bucket = new TokenBucket({ tokensPerInterval: 2, interval: 60_000 });
        bucket.consume();
        bucket.consume();
        expect(bucket.consume()).toBe(false);
    });

    it("refills tokens after interval passes", () => {
        vi.useFakeTimers();
        const bucket = new TokenBucket({ tokensPerInterval: 2, interval: 1000 });
        bucket.consume();
        bucket.consume();
        expect(bucket.consume()).toBe(false);

        vi.advanceTimersByTime(1001);
        expect(bucket.consume()).toBe(true);
        vi.useRealTimers();
    });

    it("remaining() returns correct count", () => {
        const bucket = new TokenBucket({ tokensPerInterval: 5, interval: 60_000 });
        expect(bucket.remaining()).toBe(5);
        bucket.consume();
        expect(bucket.remaining()).toBe(4);
    });

    it("does not exceed max tokens after multiple refills", () => {
        vi.useFakeTimers();
        const bucket = new TokenBucket({ tokensPerInterval: 3, interval: 1000 });
        vi.advanceTimersByTime(5000);
        expect(bucket.remaining()).toBe(3); // capped at tokensPerInterval
        vi.useRealTimers();
    });
});

describe("checkRateLimit", () => {
    beforeEach(() => {
        // Override to fresh buckets for each test
        overrideRateLimit("bash", { tokensPerInterval: 2, interval: 60_000 });
        overrideRateLimit("file.write", { tokensPerInterval: 2, interval: 60_000 });
    });

    it("allows safe tools without limits", () => {
        const result = checkRateLimit("file.read");
        expect(result.allowed).toBe(true);
        expect(result.error).toBeUndefined();
    });

    it("allows dangerous tools within limit", () => {
        const result = checkRateLimit("bash");
        expect(result.allowed).toBe(true);
    });

    it("blocks dangerous tools when limit exceeded", () => {
        checkRateLimit("bash");
        checkRateLimit("bash");
        const result = checkRateLimit("bash");
        expect(result.allowed).toBe(false);
        expect(result.error).toContain("Rate limit exceeded");
        expect(result.error).toContain("bash");
    });

    it("tracks limits per-tool independently", () => {
        checkRateLimit("bash");
        checkRateLimit("bash");
        // bash exhausted, but file.write still available
        const result = checkRateLimit("file.write");
        expect(result.allowed).toBe(true);
    });

    it("tools-list is not rate-limited", () => {
        for (let i = 0; i < 100; i++) {
            expect(checkRateLimit("tools.list").allowed).toBe(true);
        }
    });
});
