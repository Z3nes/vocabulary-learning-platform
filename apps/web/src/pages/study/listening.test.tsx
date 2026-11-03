import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WrittenSessionPage, WrittenSetupPage } from './WrittenRecallPage';
import { AudioControls } from './AudioControls';
import { practiceKeys, type PracticeSession, type PracticeEvaluation } from '../../lib/practice';
import { isActivity } from '../../lib/activity';

const time = '2026-10-23T12:00:00Z';
const base: PracticeSession = {
  id: 's',
  listId: 'list',
  listTitle: 'Algorithms',
  practiceType: 'listening',
  percentage: 100,
  eligibleCount: 1,
  questionCount: 1,
  currentPosition: 0,
  version: 0,
  status: 'ACTIVE',
  createdAt: time,
  completedAt: null,
  canceledAt: null,
  currentQuestion: {
    id: 'q',
    position: 0,
    meanings: ['algoritma', 'işlem yolu'],
    evaluation: null,
    resolution: null,
  },
  results: [],
  correctCount: 0,
  incorrectCount: 0,
  skippedCount: 0,
  masteryEligibleCount: 0,
  masteryAppliedCount: 0,
};
const enVoice = {
  name: 'English voice',
  lang: 'en-US',
  localService: true,
  voiceURI: 'en',
  default: false,
} satisfies SpeechSynthesisVoice;
class Utterance {
  voice: SpeechSynthesisVoice | null = null;
  lang = '';
  rate = 1;
  onend: ((e: SpeechSynthesisEvent) => void) | null = null;
  onerror: ((e: SpeechSynthesisErrorEvent) => void) | null = null;
  constructor(public text: string) {}
}
class Media {
  static instances: Media[] = [];
  src = '';
  playbackRate = 1;
  preservesPitch = true;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  play = vi.fn(() => Promise.resolve());
  pause = vi.fn();
  load = vi.fn();
  removeAttribute = vi.fn();
  constructor() {
    Media.instances.push(this);
  }
}
let voices: SpeechSynthesisVoice[],
  spoken: Utterance[],
  events: EventTarget,
  synth: {
    getVoices: ReturnType<typeof vi.fn>;
    cancel: ReturnType<typeof vi.fn>;
    speak: ReturnType<typeof vi.fn>;
    addEventListener: EventTarget['addEventListener'];
    removeEventListener: EventTarget['removeEventListener'];
  };
let client: QueryClient,
  session: PracticeSession,
  active: PracticeSession | null,
  audioMode: 'browser' | 'azure' | 'fail',
  evaluation: PracticeEvaluation;
let calls: { url: string; body: unknown; signal: AbortSignal | null | undefined }[];
const json = (body: unknown) =>
  new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
const objectUrl = Object.getOwnPropertyDescriptor(URL, 'createObjectURL');
const revokeUrl = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL');
const revokeMock = vi.fn<(_url: string) => void>();
beforeEach(() => {
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  session = structuredClone(base);
  active = null;
  audioMode = 'browser';
  calls = [];
  evaluation = {
    answer: 'algorithm',
    english: 'algorithm',
    correct: true,
    masteryEligible: true,
    masteryApplied: false,
    feedback: 'target',
  };
  voices = [enVoice];
  spoken = [];
  events = new EventTarget();
  Media.instances = [];
  synth = {
    getVoices: vi.fn(() => voices),
    cancel: vi.fn(),
    speak: vi.fn((u: Utterance) => spoken.push(u)),
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
  };
  vi.stubGlobal('speechSynthesis', synth);
  vi.stubGlobal('SpeechSynthesisUtterance', Utterance);
  vi.stubGlobal('Audio', Media);
  URL.createObjectURL = vi.fn(() => 'blob:audio');
  revokeMock.mockClear();
  URL.revokeObjectURL = revokeMock;
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const body: unknown =
        typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined;
      calls.push({ url, body, signal: init?.signal });
      if (url.includes('/practice/active')) return Promise.resolve(json({ session: active }));
      if (url.endsWith('/lists/list'))
        return Promise.resolve(
          json({
            list: {
              id: 'list',
              title: 'Algorithms',
              wordCount: 250,
              createdAt: time,
              updatedAt: time,
            },
          }),
        );
      if (url.endsWith('/lists/list/practice')) return Promise.resolve(json({ session }));
      if (url.endsWith('/audio')) {
        if (audioMode === 'fail') return Promise.reject(new TypeError('offline'));
        if (
          audioMode === 'azure' &&
          !(
            typeof body === 'object' &&
            body !== null &&
            'provider' in body &&
            body.provider === 'browser'
          )
        )
          return Promise.resolve(
            new Response(new Uint8Array([73, 68, 51]), {
              headers: { 'content-type': 'audio/mpeg' },
            }),
          );
        return Promise.resolve(json({ provider: 'browser', text: 'algorithm', locale: 'en-US' }));
      }
      if (url.endsWith('/answers')) {
        session = {
          ...session,
          version: 1,
          currentQuestion: { ...session.currentQuestion!, resolution: 'answered', evaluation },
        };
        return Promise.resolve(json({ session, applied: true }));
      }
      if (url.endsWith('/skip-audio')) {
        session = {
          ...session,
          version: 1,
          skippedCount: 1,
          currentQuestion: { ...session.currentQuestion!, resolution: 'audio_unavailable' },
        };
        return Promise.resolve(json({ session, applied: true }));
      }
      if (url.endsWith('/next')) {
        session = {
          ...session,
          currentPosition: 1,
          version: 2,
          currentQuestion: {
            id: 'q2',
            position: 1,
            meanings: ['özyineleme'],
            resolution: null,
            evaluation: null,
          },
        };
        return Promise.resolve(json({ session, applied: true }));
      }
      if (url.endsWith('/complete')) {
        session = {
          ...session,
          status: 'COMPLETED',
          completedAt: time,
          correctCount: session.skippedCount ? 0 : 1,
          incorrectCount: 0,
          masteryAppliedCount: session.skippedCount ? 0 : 1,
          results: [session.currentQuestion!],
          currentQuestion: null,
        };
        return Promise.resolve(json({ session, applied: true }));
      }
      if (url.endsWith('/cancel')) {
        active = null;
        session = { ...session, status: 'CANCELED', canceledAt: time, currentQuestion: null };
        return Promise.resolve(json({ session, applied: true }));
      }
      return Promise.resolve(json({ session }));
    }),
  );
});
afterEach(() => {
  client.clear();
  vi.unstubAllGlobals();
  if (objectUrl) Object.defineProperty(URL, 'createObjectURL', objectUrl);
  else Reflect.deleteProperty(URL, 'createObjectURL');
  if (revokeUrl) Object.defineProperty(URL, 'revokeObjectURL', revokeUrl);
  else Reflect.deleteProperty(URL, 'revokeObjectURL');
});
function mount(path = '/study/practice/s') {
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/study/practice/:sessionId" element={<WrittenSessionPage />} />
          <Route
            path="/lists/:id/listening"
            element={<WrittenSetupPage practiceType="listening" />}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
const audioCalls = () => calls.filter((c) => c.url.endsWith('/audio'));
async function play() {
  fireEvent.click(await screen.findByRole('button', { name: 'Dinle' }));
  await waitFor(() => expect(spoken.length + Media.instances.length).toBeGreaterThan(0));
}
async function endBrowser(index = spoken.length - 1) {
  await act(() => {
    spoken[index]!.onend?.({} as SpeechSynthesisEvent);
    return Promise.resolve();
  });
}

describe('listening setup and exact-feedback UI', () => {
  it('uses listening type, approved percentages, accurate counts and the shared persistent route', async () => {
    mount('/lists/list/listening');
    await screen.findByRole('button', { name: 'Başla' });
    expect(screen.getByRole('heading', { name: 'Dinle ve Yaz' })).toBeDefined();
    expect(screen.getByText('%15 · 38 soru')).toBeDefined();
    fireEvent.click(screen.getByRole('radio', { name: '%100 · 250 soru' }));
    fireEvent.click(screen.getByRole('button', { name: 'Başla' }));
    await screen.findByRole('button', { name: 'Dinle' });
    expect(calls.find((c) => c.url.endsWith('/lists/list/practice'))?.body).toEqual({
      percentage: 100,
      practiceType: 'listening',
    });
    expect(calls.some((c) => c.url.endsWith('/active?practiceType=listening'))).toBe(true);
    expect(audioCalls()).toHaveLength(0);
  });
  it('shows all Turkish meanings, hides spelling and makes no automatic speech request', async () => {
    mount();
    const input = await screen.findByRole('textbox');
    expect(screen.getByText('algoritma; işlem yolu')).toBeDefined();
    expect(document.body.textContent).not.toContain('algorithm');
    expect(audioCalls()).toHaveLength(0);
    expect(synth.speak).not.toHaveBeenCalled();
    for (const [attr, value] of Object.entries({
      autocapitalize: 'none',
      autocorrect: 'off',
      spellcheck: 'false',
      autocomplete: 'off',
    }))
      expect(input.getAttribute(attr)).toBe(value);
  });
  it('locks one attempt, reveals authoritative spelling immediately and stops active speech', async () => {
    mount();
    await play();
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'algorithm' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cevabı kontrol et' }));
    await screen.findByText('Doğru');
    expect(screen.getByText('algorithm', { selector: 'strong' })).toBeDefined();
    expect(screen.getByRole<HTMLInputElement>('textbox').disabled).toBe(true);
    expect(screen.queryByRole('button', { name: 'Cevabı kontrol et' })).toBeNull();
    expect(synth.cancel.mock.calls.length).toBeGreaterThan(1);
    expect(calls.find((c) => c.url.endsWith('/answers'))?.body).toEqual({
      questionId: 'q',
      version: 0,
      answer: 'algorithm',
    });
    expect(session.masteryAppliedCount).toBe(0);
  });
  it('renders wrong-answer target feedback and durable evaluation after reload', async () => {
    evaluation = {
      ...evaluation,
      answer: 'algoritm',
      correct: false,
      masteryEligible: false,
      feedback: 'incorrect',
    };
    const page = mount();
    const input = await screen.findByRole('textbox');
    fireEvent.change(input, { target: { value: 'algoritm' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cevabı kontrol et' }));
    await screen.findByText('Yanlış');
    page.unmount();
    client.clear();
    mount();
    await screen.findByText('Yanlış');
    expect(screen.getByRole<HTMLInputElement>('textbox').disabled).toBe(true);
    expect(screen.getByText('algorithm', { selector: 'strong' })).toBeDefined();
  });
  it('offers continue/cancel for the listening session without disturbing written recall cache', async () => {
    active = session;
    client.setQueryData(practiceKeys.active('list', 'written-recall'), {
      ...session,
      id: 'written',
      practiceType: 'written-recall',
    });
    mount('/lists/list/listening');
    expect((await screen.findByRole('link', { name: 'Devam Et' })).getAttribute('href')).toBe(
      '/study/practice/s',
    );
    fireEvent.click(screen.getByRole('button', { name: 'İptal Et' }));
    expect(calls.filter((c) => c.url.endsWith('/cancel'))).toHaveLength(0);
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'İptali onayla' }),
    );
    await screen.findByRole('button', { name: 'Başla' });
    expect(
      client.getQueryData<{ id: string }>(practiceKeys.active('list', 'written-recall'))?.id,
    ).toBe('written');
  });
  it('persists an explicit unavailable skip and completes with separate skip counts and no credit', async () => {
    voices = [];
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Dinle' }));
    const skip = await screen.findByRole('button', { name: 'Ses kullanılamıyor, soruyu atla' });
    expect(calls.filter((c) => c.url.endsWith('/skip-audio'))).toHaveLength(0);
    fireEvent.click(skip);
    await screen.findByText(/Bu soru doğru veya yanlış sayılmaz/);
    expect(screen.queryByRole('textbox')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Çalışmayı tamamla' }));
    await screen.findByRole('heading', { name: 'Çalışmayı tamamladın' });
    expect(
      screen.getByText(/Doğru: 0 · Yanlış: 0 · Ses kullanılamadığı için atlanan: 1/),
    ).toBeDefined();
    expect(screen.getByText(/Uygulanan öğrenme katkısı: 0/)).toBeDefined();
  });
});

describe('explicit playback and graceful provider fallback', () => {
  it('plays/replays browser English speech without visible or announced target leakage', async () => {
    mount();
    await play();
    expect(spoken[0]).toMatchObject({ text: 'algorithm', voice: enVoice, lang: 'en-US', rate: 1 });
    expect(document.body.textContent).not.toContain('algorithm');
    await endBrowser();
    fireEvent.click(screen.getByRole('button', { name: 'Tekrar dinle' }));
    await waitFor(() => expect(spoken).toHaveLength(2));
    expect(audioCalls()).toHaveLength(1);
    await endBrowser();
  });
  it('supports slow replay and cancels previous speech instead of overlapping it', async () => {
    mount();
    await play();
    fireEvent.click(screen.getByRole('combobox', { name: 'Ses hızı' }));
    fireEvent.click(screen.getByRole('option', { name: '0.8× · Yavaş' }));
    fireEvent.click(screen.getByRole('button', { name: 'Tekrar dinle' }));
    await waitFor(() => expect(spoken).toHaveLength(2));
    expect(spoken[1]!.rate).toBe(0.8);
    expect(spoken[0]!.onend).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Sesi durdur' }));
    expect(spoken[1]!.onend).toBeNull();
  });
  it('waits for asynchronous English voices and retries cached browser data without Azure', async () => {
    voices = [];
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Dinle' }));
    await screen.findByRole('button', { name: 'Ses kullanılamıyor, soruyu atla' });
    voices = [enVoice];
    await act(() => {
      events.dispatchEvent(new Event('voiceschanged'));
      return Promise.resolve();
    });
    expect(screen.getByText(/İngilizce sesi hazır/)).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Tekrar dinle' }));
    await waitFor(() => expect(spoken).toHaveLength(1));
    await endBrowser();
    expect(audioCalls()).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Ses kullanılamıyor, soruyu atla' })).toBeNull();
  });
  it('handles unsupported browsers and speech errors with explicit no-penalty skip', async () => {
    vi.stubGlobal('speechSynthesis', undefined);
    vi.stubGlobal('SpeechSynthesisUtterance', undefined);
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Dinle' }));
    await screen.findByRole('button', { name: 'Ses kullanılamıyor, soruyu atla' });
    expect(screen.getByText(/Ses üretilemedi/)).toBeDefined();
  });
  it('does not select a Turkish voice and permits retry after engine failure', async () => {
    mount();
    await play();
    await act(() => {
      spoken[0]!.onerror?.({} as SpeechSynthesisErrorEvent);
      return Promise.resolve();
    });
    await screen.findByRole('button', { name: 'Ses kullanılamıyor, soruyu atla' });
    voices = [{ ...enVoice, lang: 'tr-TR' }];
    fireEvent.click(screen.getByRole('button', { name: 'Tekrar dinle' }));
    await screen.findByText(/uygun bir İngilizce ses henüz bulunamadı/);
    expect(spoken).toHaveLength(1);
  });
  it('plays preferred MP3 output, adjusts rate and revokes bounded object URLs', async () => {
    audioMode = 'azure';
    const page = mount();
    await play();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Sesi durdur' })).toBeDefined());
    expect(Media.instances[0]!.src).toBe('blob:audio');
    expect(spoken).toHaveLength(0);
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Ses hızı' }), { key: 'End' });
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Ses hızı' }), { key: ' ' });
    expect(Media.instances[0]!.pause).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Tekrar dinle' }));
    await waitFor(() => expect(Media.instances).toHaveLength(2));
    expect(Media.instances[1]!.playbackRate).toBe(0.8);
    page.unmount();
    expect(revokeMock).toHaveBeenCalledWith('blob:audio');
    expect(Media.instances[1]!.pause).toHaveBeenCalled();
    expect(audioCalls()).toHaveLength(1);
  });
  it('falls back after audio decode/playback failure without repeating Azure generation', async () => {
    audioMode = 'azure';
    mount();
    await play();
    await act(() => {
      Media.instances[0]!.onerror?.();
      return Promise.resolve();
    });
    await waitFor(() => expect(spoken).toHaveLength(1));
    expect(audioCalls().map((c) => c.body)).toEqual([
      { provider: 'preferred' },
      { provider: 'browser' },
    ]);
    await endBrowser();
    fireEvent.click(screen.getByRole('button', { name: 'Tekrar dinle' }));
    await waitFor(() => expect(spoken).toHaveLength(2));
    expect(audioCalls()).toHaveLength(2);
    await endBrowser();
  });
  it('recovers from media autoplay restrictions through explicit browser fallback', async () => {
    audioMode = 'azure';
    vi.stubGlobal(
      'Audio',
      class extends Media {
        override play = vi.fn(() => Promise.reject(new Error('NotAllowedError')));
      },
    );
    mount();
    await play();
    await waitFor(() => expect(spoken).toHaveLength(1));
    expect(audioCalls().map((c) => c.body)).toEqual([
      { provider: 'preferred' },
      { provider: 'browser' },
    ]);
    await endBrowser();
  });
  it('handles connection failures without silently skipping and allows explicit retry', async () => {
    audioMode = 'fail';
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Dinle' }));
    await screen.findByRole('button', { name: 'Ses kullanılamıyor, soruyu atla' });
    expect(calls.some((c) => c.url.endsWith('/skip-audio'))).toBe(false);
    audioMode = 'browser';
    fireEvent.click(screen.getByRole('button', { name: 'Dinle' }));
    await waitFor(() => expect(spoken).toHaveLength(1));
    await endBrowser();
  });
  it('aborts in-flight audio when leaving and ignores late responses', async () => {
    let release!: (r: Response) => void;
    vi.mocked(fetch).mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const view = render(<AudioControls sessionId="s" questionId="q" availability={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Dinle' }));
    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1));
    const signal = vi.mocked(fetch).mock.calls[0]![1]!.signal;
    view.unmount();
    expect(signal?.aborted).toBe(true);
    await act(() => {
      release(json({ provider: 'browser', text: 'algorithm', locale: 'en-US' }));
      return Promise.resolve();
    });
    expect(spoken).toHaveLength(0);
  });
  it('keeps listening skips distinct in combined history without broadening legacy game limits', () => {
    const item = {
      wordId: null,
      english: 'algorithm',
      meanings: ['algoritma'],
      outcome: 'audio_unavailable',
      attempts: 0,
    };
    const row = {
      key: 'g',
      at: time,
      kind: 'game',
      game: {
        id: 'g',
        wordListId: null,
        listTitle: 'Context',
        gameType: 'listening',
        items: Array.from({ length: 250 }, () => item),
      },
    };
    expect(isActivity(row)).toBe(true);
    expect(isActivity({ ...row, game: { ...row.game, gameType: 'quiz' } })).toBe(false);
  });
});
