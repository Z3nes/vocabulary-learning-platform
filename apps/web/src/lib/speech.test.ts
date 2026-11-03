import { afterEach, describe, expect, it, vi } from 'vitest';
import { BrowserSpeech, englishVoice, fetchSpeech } from './speech';

const voice = (lang: string, localService = false): SpeechSynthesisVoice => ({
  lang,
  localService,
  name: lang,
  voiceURI: lang,
  default: false,
});
function host(initial: SpeechSynthesisVoice[] = [voice('en-US', true)]) {
  let voices = initial;
  const utterances: SpeechSynthesisUtterance[] = [];
  const events = new EventTarget();
  const cancel = vi.fn();
  const speak = vi.fn((u: SpeechSynthesisUtterance) => utterances.push(u));
  const synth = {
    getVoices: vi.fn(() => voices),
    cancel,
    speak,
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
    onvoiceschanged: null,
  } as unknown as SpeechSynthesis;
  const create = (text: string) =>
    ({
      text,
      voice: null,
      lang: '',
      rate: 1,
      onend: null,
      onerror: null,
    }) as unknown as SpeechSynthesisUtterance;
  return {
    driver: new BrowserSpeech({ synthesis: synth, utterance: create }),
    synth,
    cancel,
    speak,
    utterances,
    setVoices: (next: SpeechSynthesisVoice[]) => {
      voices = next;
      events.dispatchEvent(new Event('voiceschanged'));
    },
  };
}
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
describe('browser English speech fallback', () => {
  it('prefers a local en-US voice, then en-US, then another English voice', () => {
    expect(
      englishVoice([voice('tr-TR', true), voice('en-GB'), voice('en-US'), voice('en-US', true)])
        ?.localService,
    ).toBe(true);
    expect(englishVoice([voice('tr-TR', true), voice('en-GB', true), voice('en-US')])?.lang).toBe(
      'en-US',
    );
    expect(englishVoice([voice('tr-TR'), voice('en-GB')])?.lang).toBe('en-GB');
    expect(englishVoice([voice('tr-TR')])).toBeUndefined();
  });
  it('never silently uses a non-English default voice', async () => {
    const h = host([voice('tr-TR', true)]);
    expect(h.driver.available()).toBe(false);
    await expect(h.driver.play('hidden', 1)).rejects.toMatchObject({ reason: 'no_english_voice' });
    expect(h.speak).not.toHaveBeenCalled();
  });
  it('handles missing Web Speech API gracefully', async () => {
    const driver = new BrowserSpeech(null);
    expect(driver.available()).toBe(false);
    driver.stop();
    driver.subscribe(() => {})();
    await expect(driver.play('word', 1)).rejects.toMatchObject({ reason: 'unsupported' });
  });
  it('handles asynchronous voices and removes the listener when leaving', async () => {
    const h = host([]),
      changed = vi.fn(),
      unsubscribe = h.driver.subscribe(changed);
    await expect(h.driver.play('word', 1)).rejects.toMatchObject({ reason: 'no_english_voice' });
    h.setVoices([voice('en-US')]);
    expect(changed).toHaveBeenCalledTimes(1);
    expect(h.driver.available()).toBe(true);
    const done = h.driver.play('word', 1);
    h.utterances[0]!.onend?.({} as SpeechSynthesisEvent);
    await done;
    unsubscribe();
    h.setVoices([]);
    expect(changed).toHaveBeenCalledTimes(1);
    expect(h.driver.available()).toBe(false);
  });
  it('sets the explicit English voice, locale and slow rate', async () => {
    const h = host([voice('en-GB')]);
    const done = h.driver.play('recursion', 0.8);
    expect(h.utterances[0]).toMatchObject({
      text: 'recursion',
      lang: 'en-GB',
      rate: 0.8,
      voice: { lang: 'en-GB' },
    });
    h.utterances[0]!.onend?.({} as SpeechSynthesisEvent);
    await done;
  });
  it('cancels previous utterances on replay, including late old events', async () => {
    const h = host();
    const first = h.driver.play('one', 1);
    const rejection = expect(first).rejects.toMatchObject({ reason: 'canceled' });
    const oldEnd = h.utterances[0]!.onend;
    const second = h.driver.play('two', 0.8);
    await rejection;
    oldEnd?.call(h.utterances[0]!, {} as SpeechSynthesisEvent);
    h.utterances[1]!.onend?.({} as SpeechSynthesisEvent);
    await second;
    expect(h.cancel).toHaveBeenCalledTimes(2);
  });
  it('stops active speech and rejects its pending playback promise', async () => {
    const h = host();
    const done = expect(h.driver.play('word', 1)).rejects.toMatchObject({ reason: 'canceled' });
    h.driver.stop();
    await done;
    expect(h.utterances[0]!.onend).toBeNull();
    expect(h.utterances[0]!.onerror).toBeNull();
  });
  it('uses updated English voice availability on the next explicit playback', async () => {
    const h = host();
    h.setVoices([voice('en-AU', true)]);
    const done = h.driver.play('word', 1);
    expect(h.utterances[0]!.lang).toBe('en-AU');
    h.utterances[0]!.onend?.({} as SpeechSynthesisEvent);
    await done;
  });
  it('handles engine errors and synchronous speech failures', async () => {
    const h = host();
    const done = expect(h.driver.play('word', 1)).rejects.toMatchObject({ reason: 'failed' });
    h.utterances[0]!.onerror?.({} as SpeechSynthesisErrorEvent);
    await done;
    h.speak.mockImplementation(() => {
      throw new Error('blocked');
    });
    await expect(h.driver.play('word', 1)).rejects.toMatchObject({ reason: 'failed' });
  });
  it('times out a stalled engine without leaving speech active', async () => {
    vi.useFakeTimers();
    const h = host();
    const done = expect(h.driver.play('word', 1)).rejects.toMatchObject({ reason: 'failed' });
    await vi.advanceTimersByTimeAsync(30001);
    await done;
    expect(h.cancel).toHaveBeenCalledTimes(2);
  });
});
describe('authorized audio transport', () => {
  it('uses relative paths and posts only provider choice, never client text/URLs', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ provider: 'browser', text: 'C plus plus', locale: 'en-US' }),
          { headers: { 'content-type': 'application/json' } },
        ),
      );
    vi.stubGlobal('fetch', fetcher);
    const signal = new AbortController().signal;
    expect(await fetchSpeech('s', 'q', 'browser', signal)).toEqual({
      kind: 'browser',
      text: 'C plus plus',
      locale: 'en-US',
    });
    expect(fetcher.mock.calls[0]![0]).toBe('/api/practice/s/questions/q/audio');
    expect(fetcher.mock.calls[0]![1]).toMatchObject({
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json', accept: 'audio/mpeg, application/json' },
      body: JSON.stringify({ provider: 'browser' }),
    });
    expect(fetcher.mock.calls[0]![1]!.signal instanceof AbortSignal).toBe(true);
  });
  it('accepts bounded MP3 output', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(new Uint8Array([1, 2]), { headers: { 'content-type': 'audio/mpeg' } }),
        ),
    );
    expect((await fetchSpeech('s', 'q', 'preferred', new AbortController().signal)).kind).toBe(
      'azure',
    );
  });
  it.each(['timeout', 'navigation'])(
    'bounds a stalled audio request and forwards %s cancellation',
    async (reason) => {
      vi.useFakeTimers();
      const external = new AbortController();
      vi.stubGlobal(
        'fetch',
        vi.fn<typeof fetch>().mockImplementation(
          (_input, init) =>
            new Promise((_resolve, reject) => {
              init!.signal!.addEventListener('abort', () => reject(new Error('aborted')));
            }),
        ),
      );
      const done = expect(fetchSpeech('s', 'q', 'preferred', external.signal)).rejects.toThrow(
        'aborted',
      );
      if (reason === 'timeout') await vi.advanceTimersByTimeAsync(10001);
      else external.abort();
      await done;
    },
  );
  it.each([
    { provider: 'browser', text: 'answer', locale: 'tr-TR' },
    { provider: 'browser', text: '', locale: 'en-US' },
    { provider: 'azure', url: 'https://evil.test' },
  ])('rejects unsafe/invalid browser fallback payloads %j', async (payload) => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(payload), {
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );
    await expect(
      fetchSpeech('s', 'q', 'preferred', new AbortController().signal),
    ).rejects.toThrow();
  });
});
