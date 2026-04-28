import { describe, it, expect, vi } from "vitest";
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
        expect(bucket.remaining()).toBe(3);
        vi.useRealTimers();
    });
});

describe("checkRateLimit", () => {
    it("allows all tools by default (no limits configured)", () => {
        expect(checkRateLimit("bash").allowed).toBe(true);
        expect(checkRateLimit("powershell").allowed).toBe(true);
        expect(checkRateLimit("file.write").allowed).toBe(true);
        expect(checkRateLimit("git").allowed).toBe(true);
        expect(checkRateLimit("file.read").allowed).toBe(true);
        expect(checkRateLimit("tools.list").allowed).toBe(true);
    });

    it("respects overrideRateLimit when explicitly set", () => {
        overrideRateLimit("test-tool", { tokensPerInterval: 2, interval: 60_000 });
        expect(checkRateLimit("test-tool").allowed).toBe(true);
        expect(checkRateLimit("test-tool").allowed).toBe(true);
        const blocked = checkRateLimit("test-tool");
        expect(blocked.allowed).toBe(false);
        expect(blocked.error).toContain("Rate limit exceeded");
        expect(blocked.error).toContain("test-tool");
    });

    it("unlimited calls work for any unregistered tool", () => {
        for (let i = 0; i < 100; i++) {
            expect(checkRateLimit("powershell").allowed).toBe(true);
        }
    });
});
