import { AiGatewayError } from "./errors.ts";

type Bucket = { count: number; resetAt: number };

export class InMemoryRateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  check(key: string, limit: number, now = Date.now()) {
    const minuteMs = 60_000;
    const existing = this.buckets.get(key);
    if (!existing || existing.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + minuteMs });
      this.prune(now);
      return;
    }
    if (existing.count >= limit) {
      const retryAfterSeconds = Math.max(1, Math.ceil((existing.resetAt - now) / 1_000));
      throw new AiGatewayError("AI_RATE_LIMITED", {
        httpStatus: 429,
        retryable: true,
        retryAfterSeconds,
      });
    }
    existing.count += 1;
  }

  private prune(now: number) {
    if (this.buckets.size < 2_000) return;
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= now) this.buckets.delete(key);
    }
  }
}
