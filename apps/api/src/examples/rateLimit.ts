import { ApplicationError } from '../http/errors.js';

/** Process-local fixed window, keyed by authenticated internal user ID. Kept
 * small because the maintained Fastify plugin was unavailable in this offline
 * install. Do not evict live windows to admit new identities (would bypass limits).
 */
export class ExampleRateLimit {
  private readonly windows = new Map<string, { expires: number; count: number }>();
  constructor(
    private readonly now = Date.now,
    private readonly max = 20,
    private readonly windowMs = 60_000,
    private readonly capacity = 10_000,
  ) {}
  check(userId: string): void {
    const now = this.now();
    let window = this.windows.get(userId);
    if (!window || window.expires <= now) {
      for (const [key, item] of this.windows) if (item.expires <= now) this.windows.delete(key);
      if (this.windows.size >= this.capacity) throw new ApplicationError(503, 'EXAMPLES_BUSY');
      window = { expires: now + this.windowMs, count: 0 };
      this.windows.set(userId, window);
    }
    if (++window.count > this.max)
      throw new ApplicationError(
        429,
        'EXAMPLES_RATE_LIMITED',
        Math.ceil((window.expires - now) / 1000),
      );
  }
}
