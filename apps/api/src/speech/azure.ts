import { ApplicationError } from '../http/errors.js';
import { speechConfigSchema, speechLocale, type SpeechConfig } from './config.js';
import { ssml, spokenText } from './pronunciation.js';
import { englishKey } from '../vocabulary/input.js';

export interface SpeechProvider {
  cacheKey(text: string): string;
  synthesize(text: string): Promise<Buffer>;
}
export const maxAudioBytes = 512 * 1024;
export class AzureSpeechProvider implements SpeechProvider {
  private readonly config: SpeechConfig;
  constructor(
    config: SpeechConfig,
    private readonly fetcher: typeof fetch = fetch,
    private readonly timeoutMs = 6000,
  ) {
    // Also protect direct buildApp configuration; never echo rejected secrets.
    const parsed = speechConfigSchema.safeParse(config);
    if (!parsed.success) throw new Error('Invalid speech provider configuration');
    this.config = parsed.data;
  }
  cacheKey(text: string) {
    return JSON.stringify({
      normalized: englishKey(spokenText(text)),
      ssml: ssml(text, this.config.voice),
      voice: this.config.voice,
      locale: speechLocale,
      format: this.config.format,
      region: this.config.region,
      pronunciation: 'technical-v1',
    });
  }
  async synthesize(text: string): Promise<Buffer> {
    if (!this.config.enabled || !this.config.key || !this.config.region)
      throw new ApplicationError(503, 'SPEECH_UNAVAILABLE');
    if (
      !text.trim() ||
      [...text].length > 120 ||
      [...text].some((char) => {
        const code = char.codePointAt(0)!;
        return (code < 32 && ![9, 10, 13].includes(code)) || code === 65534 || code === 65535;
      })
    )
      throw new ApplicationError(503, 'SPEECH_UNAVAILABLE');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetcher(
        `https://${this.config.region}.tts.speech.microsoft.com/cognitiveservices/v1`,
        {
          method: 'POST',
          redirect: 'error',
          signal: controller.signal,
          headers: {
            'Ocp-Apim-Subscription-Key': this.config.key,
            'Content-Type': 'application/ssml+xml',
            'X-Microsoft-OutputFormat': this.config.format,
            'User-Agent': 'UniversityVocabulary',
          },
          body: ssml(text, this.config.voice),
        },
      );
      if (!response.ok) {
        await response.body?.cancel();
        throw new ApplicationError(
          response.status === 429 ? 429 : 503,
          response.status === 429 ? 'SPEECH_RATE_LIMITED' : 'SPEECH_UNAVAILABLE',
        );
      }
      if (
        response.headers.get('content-type')?.split(';')[0]?.trim() !== 'audio/mpeg' ||
        Number(response.headers.get('content-length') ?? 0) > maxAudioBytes
      ) {
        await response.body?.cancel();
        throw new ApplicationError(502, 'SPEECH_INVALID_RESPONSE');
      }
      if (!response.body) throw new ApplicationError(502, 'SPEECH_INVALID_RESPONSE');
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        for (;;) {
          const part = await reader.read();
          if (part.done) break;
          const chunk: unknown = part.value;
          if (!(chunk instanceof Uint8Array))
            throw new ApplicationError(502, 'SPEECH_INVALID_RESPONSE');
          size += chunk.length;
          if (size > maxAudioBytes) {
            await reader.cancel();
            throw new ApplicationError(502, 'SPEECH_INVALID_RESPONSE');
          }
          chunks.push(chunk);
        }
      } finally {
        reader.releaseLock();
      }
      if (!size) throw new ApplicationError(502, 'SPEECH_INVALID_RESPONSE');
      return Buffer.concat(chunks);
    } catch (error) {
      if (controller.signal.aborted) throw new ApplicationError(504, 'SPEECH_TIMEOUT');
      if (error instanceof ApplicationError) throw error;
      // Fetch/driver messages can contain keys or request content. Never propagate them.
      throw new ApplicationError(503, 'SPEECH_UNAVAILABLE');
    } finally {
      clearTimeout(timer);
    }
  }
}
