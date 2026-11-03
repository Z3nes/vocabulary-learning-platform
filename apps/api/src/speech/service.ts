import { ApplicationError } from '../http/errors.js';
import type { SpeechProvider } from './azure.js';

/** Per-process bounded admission. No queue: failure immediately selects fallback. */
export class SpeechRateLimit {
  private readonly windows = new Map<string, { expires: number; count: number }>();
  constructor(
    private readonly now = Date.now,
    private readonly max = 120,
    private readonly capacity = 10000,
  ) {}
  check(ownerId: string) {
    const now = this.now();
    for (const [id, w] of this.windows) if (w.expires <= now) this.windows.delete(id);
    let w = this.windows.get(ownerId);
    if (!w) {
      if (this.windows.size >= this.capacity) throw new ApplicationError(503, 'SPEECH_BUSY');
      w = { expires: now + 60000, count: 0 };
      this.windows.set(ownerId, w);
    }
    if (++w.count > this.max)
      throw new ApplicationError(429, 'SPEECH_RATE_LIMITED', Math.ceil((w.expires - now) / 1000));
  }
}
export class SpeechService {
  private readonly cache = new Map<string, { expires: number; audio: Buffer }>();
  private readonly pending = new Map<string, Promise<Buffer>>();
  private bytes = 0;
  private cooldownUntil = 0;
  constructor(
    private readonly provider: SpeechProvider,
    private readonly cacheEnabled = false,
    private readonly now = Date.now,
    private readonly maxEntries = 200,
    private readonly maxBytes = 16 * 1024 * 1024,
    private readonly maxConcurrent = 4,
    private readonly ttl = 300000,
  ) {}
  async audio(text: string): Promise<Buffer> {
    const key = this.provider.cacheKey(text),
      now = this.now();
    for (const [k, item] of this.cache) if (item.expires <= now) this.evict(k);
    const cached = this.cache.get(key);
    if (cached) return cached.audio;
    const pending = this.pending.get(key);
    if (pending) return pending;
    if (this.cooldownUntil > now) throw new ApplicationError(503, 'SPEECH_UNAVAILABLE');
    if (this.pending.size >= this.maxConcurrent) throw new ApplicationError(503, 'SPEECH_BUSY');
    const operation = Promise.resolve()
      .then(() => this.provider.synthesize(text))
      .then((audio) => {
        if (this.cacheEnabled && audio.length <= this.maxBytes) {
          while (this.cache.size >= this.maxEntries || this.bytes + audio.length > this.maxBytes)
            this.evict(this.cache.keys().next().value!);
          this.cache.set(key, { expires: this.now() + this.ttl, audio });
          this.bytes += audio.length;
        }
        return audio;
      })
      .catch((error: unknown) => {
        // No automatic retries. Brief circuit breaker bounds quota/outage traffic.
        this.cooldownUntil =
          this.now() + (error instanceof ApplicationError && error.status === 429 ? 60000 : 15000);
        throw new ApplicationError(503, 'SPEECH_UNAVAILABLE');
      })
      .finally(() => this.pending.delete(key));
    this.pending.set(key, operation);
    return operation;
  }
  private evict(key: string) {
    const item = this.cache.get(key);
    if (item) this.bytes -= item.audio.length;
    this.cache.delete(key);
  }
}
