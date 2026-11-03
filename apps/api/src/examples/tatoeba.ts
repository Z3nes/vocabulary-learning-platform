import { z } from 'zod';
import { ApplicationError } from '../http/errors.js';
import { matchedForm, tokens, type SearchSpec } from './matching.js';
import { upstreamGate, type UpstreamGate } from './protection.js';
import { uniqueCandidates } from './selection.js';
import type { Attribution, ExampleSentence, ExampleSentenceProvider } from './types.js';

const sentence = z.object({
  id: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  text: z.string().max(2000),
  lang: z.string().nullable(),
  owner: z.string().max(200).nullable(),
  license: z.string(),
  is_unapproved: z.boolean(),
});
const translation = sentence.extend({ is_direct: z.boolean() });
const payload = z.object({
  data: z
    .array(sentence.extend({ translations: z.array(translation).max(100).optional() }))
    .max(12),
  paging: z.object({ has_next: z.boolean(), next: z.string().nullable().optional() }).optional(),
});
const licenses: Record<string, string> = {
  'CC BY 2.0 FR': 'https://creativecommons.org/licenses/by/2.0/fr/',
  'CC0 1.0': 'https://creativecommons.org/publicdomain/zero/1.0/',
};
// Narrow educational safeguard, not a moderation guarantee. Token matching avoids
// substring false positives. Applied to English AND displayed Turkish translations.
export const blockedTokens = new Set([
  'fuck',
  'fucking',
  'motherfucker',
  'shit',
  'porn',
  'pornography',
  'nigger',
  'siktir',
  'orospu',
]);
export function suitableText(text: string, source = true): boolean {
  const words = tokens(text);
  return (
    text.trim().length >= 3 &&
    text.length <= 280 &&
    words.length >= (source ? 2 : 1) &&
    words.length <= 35 &&
    !/[\p{Cc}\p{Cf}<>]/u.test(text) &&
    !words.some((word) => blockedTokens.has(word))
  );
}
function attribution(row: z.infer<typeof sentence>): Attribution | undefined {
  const url = licenses[row.license];
  if (!url || !row.owner?.trim() || row.is_unapproved) return undefined;
  return {
    id: String(row.id),
    text: row.text.trim(),
    sourceUrl: `https://tatoeba.org/en/sentences/show/${row.id}`,
    contributor: row.owner,
    license: { name: row.license, url },
  };
}
export function retrySeconds(value: string | null, now = Date.now()): number | undefined {
  if (!value) return undefined;
  const seconds = /^\d+$/u.test(value) ? Number(value) : (Date.parse(value) - now) / 1000;
  return Number.isFinite(seconds) && seconds >= 0
    ? Math.min(86400, Math.max(1, Math.ceil(seconds)))
    : undefined;
}
export const MAX_RESPONSE_BYTES = 256 * 1024;
/** Tatoeba's `relevance` order is "exact matches, then shortest sentences", so a
 * single 2-35-word page per form held only the twelve SHORTEST matches ("You ran.").
 * The first pass therefore requests a context window (Tatoeba's own word count);
 * only a thin pool triggers the original full-range pass, so words that only have
 * short sentences still get them. Request volume is unchanged for common words and
 * at most doubled (<=18 one-page requests) for rare ones.
 */
export const CONTEXT_WORD_COUNT = '6-24';
export const FALLBACK_WORD_COUNT = '2-35';
/** Two full rotations of three examples before the fallback pass is skipped. */
export const MIN_CONTEXT_POOL = 6;

export class TatoebaProvider implements ExampleSentenceProvider {
  private cooldownUntil = 0;
  constructor(
    private readonly fetcher: typeof fetch = fetch,
    private readonly gate: UpstreamGate = upstreamGate,
    private readonly timeoutMs = 6000,
  ) {}
  private async page(query: string, wordCount: string): Promise<z.infer<typeof payload>> {
    return this.gate.run(async () => {
      if (this.cooldownUntil > Date.now())
        throw new ApplicationError(
          429,
          'EXAMPLES_RATE_LIMITED',
          Math.ceil((this.cooldownUntil - Date.now()) / 1000),
        );
      const url = new URL('https://api.tatoeba.org/v1/sentences');
      const parameters = {
        lang: 'eng',
        q: query,
        sort: 'relevance',
        word_count: wordCount,
        is_orphan: 'no',
        is_unapproved: 'no',
        'showtrans:lang': 'tur',
        'showtrans:is_direct': 'yes',
        'showtrans:is_orphan': 'no',
        'showtrans:is_unapproved': 'no',
        limit: '12',
      };
      for (const [key, value] of Object.entries(parameters)) url.searchParams.set(key, value);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const response = await this.fetcher(url, {
          signal: controller.signal,
          redirect: 'error',
          headers: {
            accept: 'application/json',
            'User-Agent':
              'UniversityVocabularyLearning/1.0 (educational on-demand examples; no audio)',
          },
        });
        if (response.status === 429) {
          const retry = retrySeconds(response.headers.get('retry-after')) ?? 60;
          this.cooldownUntil = Date.now() + retry * 1000;
          await response.body?.cancel();
          throw new ApplicationError(429, 'EXAMPLES_RATE_LIMITED', retry);
        }
        if (!response.ok) {
          await response.body?.cancel();
          throw new ApplicationError(503, 'EXAMPLES_UNAVAILABLE');
        }
        if (
          !response.headers.get('content-type')?.includes('application/json') ||
          Number(response.headers.get('content-length') ?? 0) > MAX_RESPONSE_BYTES
        ) {
          await response.body?.cancel();
          throw new ApplicationError(502, 'EXAMPLES_INVALID_RESPONSE');
        }
        if (!response.body) throw new ApplicationError(502, 'EXAMPLES_INVALID_RESPONSE');
        const reader: ReadableStreamDefaultReader<Uint8Array> = response.body.getReader();
        const chunks: Uint8Array[] = [];
        let size = 0;
        try {
          for (;;) {
            const chunk = await reader.read();
            if (chunk.done) break;
            size += chunk.value.byteLength;
            if (size > MAX_RESPONSE_BYTES) {
              await reader.cancel();
              throw new ApplicationError(502, 'EXAMPLES_INVALID_RESPONSE');
            }
            chunks.push(chunk.value);
          }
        } finally {
          reader.releaseLock();
        }
        const data: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        const result = payload.safeParse(data);
        if (!result.success) throw new ApplicationError(502, 'EXAMPLES_INVALID_RESPONSE');
        return result.data;
      } catch (error) {
        if (error instanceof ApplicationError) throw error;
        if (controller.signal.aborted) throw new ApplicationError(504, 'EXAMPLES_TIMEOUT');
        if (error instanceof SyntaxError)
          throw new ApplicationError(502, 'EXAMPLES_INVALID_RESPONSE');
        throw new ApplicationError(503, 'EXAMPLES_UNAVAILABLE');
      } finally {
        clearTimeout(timer);
      }
    });
  }
  async candidates(spec: SearchSpec): Promise<ExampleSentence[]> {
    const context = await this.collect(spec, CONTEXT_WORD_COUNT);
    if (context.length >= MIN_CONTEXT_POOL) return context;
    return uniqueCandidates([...context, ...(await this.collect(spec, FALLBACK_WORD_COUNT))]);
  }
  private async collect(spec: SearchSpec, wordCount: string): Promise<ExampleSentence[]> {
    const candidates: ExampleSentence[] = [];
    // One page per validated form and pass, <=9 requests / <=108 rows each. Returned
    // paging URLs are never fetched; this also prevents upstream pagination SSRF.
    for (const query of spec.queries) {
      const page = await this.page(query, wordCount);
      for (const row of page.data) {
        if (row.lang !== 'eng' || !suitableText(row.text)) continue;
        const form = matchedForm(row.text, spec.forms);
        const source = attribution(row);
        if (!source || !form) continue;
        const direct = row.translations
          ?.filter(
            (item) => item.lang === 'tur' && item.is_direct && suitableText(item.text, false),
          )
          .map(attribution)
          .find((item) => item !== undefined);
        candidates.push({
          ...source,
          provider: 'Tatoeba',
          matchedForm: form,
          ...(direct ? { translation: direct } : {}),
        });
      }
    }
    return uniqueCandidates(candidates);
  }
}
