import { ApplicationError } from '../http/errors.js';
import { searchSpec, type SearchSpec } from './matching.js';
import { selectExamples } from './selection.js';
import { TatoebaProvider } from './tatoeba.js';
import type { ExampleResult, ExampleSentence, ExampleSentenceProvider } from './types.js';

/** Shared by authorized users, not keyed by identity. Five-minute FIFO cache,
 * at most 200 pools and 32 in-flight distinct lookups. Failures are not cached.
 * Ownership MUST be resolved by the route before calling this service.
 */
export class ExampleService {
  private readonly cache = new Map<string, { expires: number; candidates: ExampleSentence[] }>();
  private readonly pending = new Map<string, Promise<ExampleSentence[]>>();
  constructor(
    private readonly provider: ExampleSentenceProvider,
    private readonly now = Date.now,
    private readonly ttl = 300_000,
    private readonly maxEntries = 200,
  ) {}
  private pool(spec: SearchSpec): Promise<ExampleSentence[]> {
    const key = JSON.stringify(spec);
    const cached = this.cache.get(key);
    if (cached && cached.expires > this.now()) return Promise.resolve(cached.candidates);
    this.cache.delete(key);
    const pending = this.pending.get(key);
    if (pending) return pending;
    if (this.pending.size >= 32) return Promise.reject(new ApplicationError(503, 'EXAMPLES_BUSY'));
    const operation = Promise.resolve()
      .then(() => this.provider.candidates(spec))
      .then((candidates) => {
        if (this.cache.size >= this.maxEntries) this.cache.delete(this.cache.keys().next().value!);
        this.cache.set(key, { expires: this.now() + this.ttl, candidates });
        return candidates;
      })
      .finally(() => this.pending.delete(key));
    this.pending.set(key, operation);
    return operation;
  }
  async lookup(english: string, exclude: readonly string[]): Promise<ExampleResult> {
    return { examples: selectExamples(await this.pool(searchSpec(english)), exclude) };
  }
}
export const exampleService = new ExampleService(new TatoebaProvider());
