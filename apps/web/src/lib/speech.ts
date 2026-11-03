import { ApiError, apiUrl, isRecord } from './api';

export type SpeechAsset =
  { kind: 'azure'; blob: Blob } | { kind: 'browser'; text: string; locale: 'en-US' };
/** Called only by an explicit playback action. No target text enters the DOM. */
export async function fetchSpeech(
  sessionId: string,
  questionId: string,
  provider: 'preferred' | 'browser',
  signal: AbortSignal,
): Promise<SpeechAsset> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal.aborted) abort();
  else signal.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, 10000);
  try {
    const response = await fetch(
      apiUrl(
        `/practice/${encodeURIComponent(sessionId)}/questions/${encodeURIComponent(questionId)}/audio`,
      ),
      {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json', accept: 'audio/mpeg, application/json' },
        body: JSON.stringify({ provider }),
        signal: controller.signal,
      },
    );
    if (!response.ok) throw new ApiError('Audio request failed', response.status);
    if (response.headers.get('content-type')?.split(';')[0] === 'audio/mpeg') {
      const blob = await response.blob();
      if (!blob.size || blob.size > 512 * 1024) throw new ApiError('Invalid audio response', 200);
      return { kind: 'azure', blob };
    }
    const value: unknown = await response.json();
    if (
      !isRecord(value) ||
      value['provider'] !== 'browser' ||
      value['locale'] !== 'en-US' ||
      typeof value['text'] !== 'string' ||
      !value['text'].trim() ||
      value['text'].length > 500
    )
      throw new ApiError('Invalid audio response', 200);
    return { kind: 'browser', text: value['text'], locale: 'en-US' };
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', abort);
  }
}

export function englishVoice(
  voices: readonly SpeechSynthesisVoice[],
): SpeechSynthesisVoice | undefined {
  const english = voices.filter((v) => /^en(?:[-_]|$)/iu.test(v.lang));
  return (
    english.find((v) => /^en[-_]US$/iu.test(v.lang) && v.localService) ??
    english.find((v) => /^en[-_]US$/iu.test(v.lang)) ??
    english.find((v) => v.localService) ??
    english[0]
  );
}
export class BrowserSpeechError extends Error {
  constructor(readonly reason: 'unsupported' | 'no_english_voice' | 'failed' | 'canceled') {
    super(reason);
  }
}
interface SpeechHost {
  synthesis: SpeechSynthesis;
  utterance: (text: string) => SpeechSynthesisUtterance;
}
const browserHost = (): SpeechHost | null =>
  typeof window !== 'undefined' &&
  window.speechSynthesis &&
  typeof SpeechSynthesisUtterance !== 'undefined'
    ? { synthesis: window.speechSynthesis, utterance: (text) => new SpeechSynthesisUtterance(text) }
    : null;

export class BrowserSpeech {
  private pending: ((error: BrowserSpeechError) => void) | undefined;
  constructor(private readonly host: SpeechHost | null = browserHost()) {}
  available() {
    try {
      return !!this.host && !!englishVoice(this.host.synthesis.getVoices());
    } catch {
      return false;
    }
  }
  subscribe(listener: () => void) {
    const synth = this.host?.synthesis;
    if (!synth) return () => {};
    if (typeof synth.addEventListener === 'function') {
      synth.addEventListener('voiceschanged', listener);
      return () => synth.removeEventListener('voiceschanged', listener);
    }
    const previous = synth.onvoiceschanged;
    synth.onvoiceschanged = listener;
    return () => {
      synth.onvoiceschanged = previous;
    };
  }
  stop() {
    this.pending?.(new BrowserSpeechError('canceled'));
    this.pending = undefined;
    try {
      this.host?.synthesis.cancel();
    } catch {
      /* Device no longer available. */
    }
  }
  play(text: string, rate: 0.8 | 1): Promise<void> {
    this.stop();
    const host = this.host;
    if (!host) return Promise.reject(new BrowserSpeechError('unsupported'));
    let voice: SpeechSynthesisVoice | undefined;
    try {
      voice = englishVoice(host.synthesis.getVoices());
    } catch {
      return Promise.reject(new BrowserSpeechError('failed'));
    }
    if (!voice) return Promise.reject(new BrowserSpeechError('no_english_voice'));
    return new Promise<void>((resolve, reject) => {
      let finished = false;
      let utterance: SpeechSynthesisUtterance;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const finish = (error?: BrowserSpeechError) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        if (this.pending === finish) this.pending = undefined;
        if (utterance) {
          utterance.onend = null;
          utterance.onerror = null;
        }
        if (error) reject(error);
        else resolve();
      };
      this.pending = finish;
      try {
        utterance = host.utterance(text);
        utterance.voice = voice;
        utterance.lang = voice.lang;
        utterance.rate = rate;
        utterance.onend = () => finish();
        utterance.onerror = () => finish(new BrowserSpeechError('failed'));
        timer = setTimeout(() => {
          finish(new BrowserSpeechError('failed'));
          host.synthesis.cancel();
        }, 30000);
        host.synthesis.speak(utterance);
      } catch {
        finish(new BrowserSpeechError('failed'));
      }
    });
  }
}
