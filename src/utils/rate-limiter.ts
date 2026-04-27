export interface RateLimitConfig
{
    tokensPerInterval: number;
    interval: number;
}

export class TokenBucket
{
    private tokens: number;
    private lastRefillTime: number;
    private readonly tokensPerInterval: number;
    private readonly interval: number;

    constructor(config: RateLimitConfig)
    {
        this.tokensPerInterval = config.tokensPerInterval;
        this.interval = config.interval;
        this.tokens = config.tokensPerInterval;
        this.lastRefillTime = Date.now();
    }

    consume(): boolean
    {
        this.refill();
        if (this.tokens >= 1)
        {
            this.tokens -= 1;
            return true;
        }
        return false;
    }

    remaining(): number
    {
        this.refill();
        return Math.floor(this.tokens);
    }

    private refill(): void
    {
        const now = Date.now();
        const elapsed = now - this.lastRefillTime;
        if (elapsed >= this.interval)
        {
            const intervals = Math.floor(elapsed / this.interval);
            this.tokens = Math.min(
                this.tokensPerInterval,
                this.tokens + intervals * this.tokensPerInterval,
            );
            this.lastRefillTime = now;
        }
    }
}

const TOOL_RATE_LIMITS: Record<string, RateLimitConfig> = {
    bash: { tokensPerInterval: 5, interval: 60_000 },
    powershell: { tokensPerInterval: 5, interval: 60_000 },
    "file.write": { tokensPerInterval: 20, interval: 60_000 },
    git: { tokensPerInterval: 10, interval: 60_000 },
};

const buckets = new Map<string, TokenBucket>();

export function getRateLimiterForTool(toolName: string): TokenBucket | null
{
    const config = TOOL_RATE_LIMITS[toolName];
    if (!config) return null;

    if (!buckets.has(toolName))
    {
        buckets.set(toolName, new TokenBucket(config));
    }
    return buckets.get(toolName)!;
}

export function overrideRateLimit(toolName: string, config: RateLimitConfig): void
{
    buckets.set(toolName, new TokenBucket(config));
}

export function checkRateLimit(toolName: string): { allowed: boolean; error?: string }
{
    const bucket = getRateLimiterForTool(toolName);
    if (!bucket) return { allowed: true };

    if (bucket.consume())
    {
        return { allowed: true };
    }

    return {
        allowed: false,
        error: `Rate limit exceeded for tool '${toolName}'. Try again later.`,
    };
}
