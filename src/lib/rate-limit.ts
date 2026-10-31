/**
 * Tiny in-memory fixed-window rate limiter.
 * Good enough for Vercel Hobby (single instance). For multi-region/production,
 * replace this with Upstash Redis or similar.
 */
interface Window {
  count: number;
  resetAt: number;
}

const stores = new Map<string, Window>();

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

export function rateLimit(
  key: string,
  { max = 5, windowMs = 60_000 }: { max?: number; windowMs?: number } = {}
): RateLimitResult {
  const now = Date.now();
  let window = stores.get(key);

  if (!window || now >= window.resetAt) {
    window = { count: 0, resetAt: now + windowMs };
    stores.set(key, window);
  }

  window.count += 1;

  return {
    allowed: window.count <= max,
    remaining: Math.max(0, max - window.count),
    resetAt: window.resetAt,
  };
}
