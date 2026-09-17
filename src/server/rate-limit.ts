export interface RateLimitEntry {
  attempts: number;
  resetAt: number;
}

export class MemoryRateLimiter {
  private map = new Map<string, RateLimitEntry>();
  private maxAttempts: number;
  private windowMs: number;

  constructor(maxAttempts: number = 5, windowMs: number = 60 * 1000) {
    this.maxAttempts = maxAttempts;
    this.windowMs = windowMs;
  }

  isAllowed(key: string): { allowed: boolean; remaining: number; retryAfterSeconds: number } {
    const now = Date.now();
    const entry = this.map.get(key);

    if (!entry || now > entry.resetAt) {
      this.map.set(key, { attempts: 1, resetAt: now + this.windowMs });
      return { allowed: true, remaining: this.maxAttempts - 1, retryAfterSeconds: 0 };
    }

    if (entry.attempts >= this.maxAttempts) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      return { allowed: false, remaining: 0, retryAfterSeconds: Math.max(1, retryAfter) };
    }

    entry.attempts++;
    return { allowed: true, remaining: this.maxAttempts - entry.attempts, retryAfterSeconds: 0 };
  }

  reset(key: string) {
    this.map.delete(key);
  }
}
