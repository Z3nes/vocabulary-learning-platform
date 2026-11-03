import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  isPracticeSession,
  mixedActivityNames,
  type MixedActivity,
  type PracticeQuestion,
  type PracticeSession,
} from '../../lib/practice';
import { isActivity } from '../../lib/activity';
import { MixedSetupPage } from './MixedSetupPage';
import { WrittenSessionPage } from './WrittenRecallPage';

const time = '2026-10-24T12:00:00Z';
const meanings = ['ağ', 'iletişim ağı'];
function question(mode: MixedActivity, position = 0): PracticeQuestion {
  return {
    id: `q${position}`,
    position,
    activityType: mode,
    originListId: 'list',
    originListTitle: 'Algorithms',
    revealed: false,
    meanings: ['flashcard', 'choice'].includes(mode) ? [] : meanings,
    resolution: null,
    evaluation: null,
    ...(['flashcard', 'choice'].includes(mode) ? { prompt: 'network' } : {}),
    ...(mode === 'choice'
      ? {
          options: [
            { id: 'a', meanings },
            ...['sunucu', 'dizi', 'ağaç'].map((m, i) => ({ id: `other${i}`, meanings: [m] })),
          ],
        }
      : {}),
  };
}
function session(mode: MixedActivity): PracticeSession {
  return {
    id: 'mixed',
    listId: 'list',
    listTitle: 'Algorithms',
    practiceType: 'mixed',
    percentage: 100,
    eligibleCount: 20,
    questionCount: 1,
    currentPosition: 0,
    version: 0,
    status: 'ACTIVE',
    createdAt: time,
    completedAt: null,
    canceledAt: null,
    currentQuestion: question(mode),
    results: [],
    correctCount: 0,
    incorrectCount: 0,
    skippedCount: 0,
    masteryEligibleCount: 0,
    masteryAppliedCount: 0,
    selfKnownCount: 0,
    selfMissedCount: 0,
    distribution: (Object.keys(mixedActivityNames) as MixedActivity[]).map((activityType) => ({
      activityType,
      total: activityType === mode ? 1 : 0,
      correct: 0,
      incorrect: 0,
      skipped: 0,
    })),
  };
}
let current: PracticeSession,
  active: PracticeSession | null,
  client: QueryClient,
  eligible: number,
  fail: boolean;
const calls: { url: string; body: Record<string, unknown> }[] = [];
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
beforeEach(() => {
  current = session('written-recall');
  active = null;
  eligible = 20;
  fail = false;
  calls.length = 0;
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init?: RequestInit) => {
      await Promise.resolve();
      const url = String(input),
        body = JSON.parse(typeof init?.body === 'string' ? init.body : '{}') as Record<
          string,
          unknown
        >;
      calls.push({ url, body });
      if (url === '/api/lists')
        return json({
          lists: [
            { id: 'list', title: 'Algorithms', wordCount: 20, createdAt: time, updatedAt: time },
          ],
        });
      if (url.startsWith('/api/mixed') && init?.method !== 'POST')
        return json({
          title: 'Algorithms',
          eligibleCount: eligible,
          session: active,
          resumable: active
            ? [{ id: active.id, listTitle: active.listTitle, questionCount: active.questionCount }]
            : [],
        });
      if (url === '/api/mixed') {
        active = current;
        return json({ session: current }, 201);
      }
      if (url.endsWith('/audio'))
        return json({ provider: 'browser', text: 'network', locale: 'en-US' });
      if (url === '/api/practice/mixed') return json({ session: current });
      if (fail) throw new TypeError('offline');
      const q = current.currentQuestion!;
      if (url.endsWith('/reveal')) {
        q.revealed = true;
        q.meanings = meanings;
      } else if (url.endsWith('/next')) {
        current.currentPosition++;
        current.currentQuestion = question(
          (Object.keys(mixedActivityNames) as MixedActivity[])[current.currentPosition]!,
          current.currentPosition,
        );
      } else if (url.endsWith('/cancel')) {
        current.status = 'CANCELED';
        current.currentQuestion = null;
        active = null;
      } else if (url.endsWith('/complete')) {
        current.status = 'COMPLETED';
        current.completedAt = time;
        current.results = [q];
        current.currentQuestion = null;
        active = null;
      } else if (url.endsWith('/skip-audio')) {
        q.resolution = 'audio_unavailable';
        current.skippedCount = 1;
      } else {
        const self = url.endsWith('/self-evaluation'),
          choice = url.endsWith('/choice');
        q.resolution = 'answered';
        q.meanings = meanings;
        q.evaluation = {
          answer: String(body['answer'] ?? body['evaluation'] ?? body['optionId']),
          english: 'network',
          correct: self ? null : true,
          masteryEligible: !choice,
          masteryApplied: false,
          feedback: self ? 'self' : choice ? 'choice' : 'target',
        };
        if (choice) q.correctOptionId = 'a';
        if (self) current.selfKnownCount = 1;
        else current.correctCount = 1;
      }
      current.version++;
      return json({ session: current, applied: true });
    }),
  );
});
afterEach(() => {
  client.clear();
  vi.unstubAllGlobals();
});
function mount(path = '/study/practice/mixed') {
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/study/mixed" element={<MixedSetupPage />} />
          <Route path="/study/practice/:sessionId" element={<WrittenSessionPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
describe('mixed setup and continuous rounds', () => {
  it('switches between the owned list and all-list scopes through the shared menu', async () => {
    mount('/study/mixed');
    const select = await screen.findByRole('combobox', { name: 'Çalışma kapsamı' });
    fireEvent.click(select);
    fireEvent.click(screen.getByRole('option', { name: 'Algorithms' }));
    await waitFor(() =>
      expect(calls.some((call) => call.url === '/api/mixed?listId=list')).toBe(true),
    );
    expect(select.textContent).toBe('Algorithms');
    fireEvent.keyDown(select, { key: 'Home' });
    fireEvent.keyDown(select, { key: 'Enter' });
    await waitFor(() => expect(select.textContent).toBe('Tüm listelerin'));
    fireEvent.click(await screen.findByRole('button', { name: 'Karma çalışmaya başla' }));
    await screen.findByRole('textbox', { name: 'İngilizce cevabın' });
    expect(
      calls.find((call) => call.url === '/api/mixed' && call.body['percentage'])!.body,
    ).toEqual({ listId: null, percentage: 25 });
  });
  it('previews percentages for all lists and starts a single server session', async () => {
    mount('/study/mixed');
    fireEvent.click(await screen.findByRole('radio', { name: /%50 · 10 soru/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Karma çalışmaya başla' }));
    await screen.findByRole('textbox', { name: 'İngilizce cevabın' });
    expect(calls.find((c) => c.url === '/api/mixed' && c.body['percentage'])!.body).toEqual({
      listId: null,
      percentage: 50,
    });
  });
  it('sends a selected owned-list scope and supports honest empty states', async () => {
    eligible = 0;
    mount('/study/mixed?list=list');
    await screen.findByText(/Bu kapsamda henüz kelime yok/);
    expect(calls.some((c) => c.url === '/api/mixed?listId=list')).toBe(true);
    expect(screen.queryByRole('button', { name: 'Karma çalışmaya başla' })).toBeNull();
  });
  it('resumes active sessions and uses a confirmed cancellation with safe default focus', async () => {
    active = session('flashcard');
    mount('/study/mixed?list=list');
    fireEvent.click(await screen.findByRole('button', { name: 'İptal Et' }));
    const dialog = await screen.findByRole('dialog');
    expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Devam Et' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'İptali onayla' }));
    await screen.findByRole('button', { name: 'Karma çalışmaya başla' });
    expect(calls.some((c) => c.url.endsWith('/cancel'))).toBe(true);
  });
  it('requires reveal before card self-evaluation and labels it separately from correctness', async () => {
    current = session('flashcard');
    mount();
    const reveal = await screen.findByRole('button', { name: 'Anlamları göster' });
    expect(screen.queryByText('ağ; iletişim ağı')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Bildim' })).toBeNull();
    fireEvent.click(reveal);
    const known = await screen.findByRole('button', { name: 'Bildim' });
    expect(document.activeElement).toBe(known);
    fireEvent.click(known);
    await screen.findByText(/Öz değerlendirmen: Bildim/);
    expect(screen.queryByText(/^Doğru$/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Çalışmayı tamamla' }));
    await screen.findByRole('heading', { name: 'Çalışmayı tamamladın' });
    expect(screen.getByText(/Öz bildirim · Bildim: 1/)).toBeTruthy();
  });
  it('uses the shared written input without revealing target text before evaluation', async () => {
    mount();
    const input = await screen.findByRole('textbox', { name: 'İngilizce cevabın' });
    expect(screen.queryByText('network')).toBeNull();
    expect(input.getAttribute('autocomplete')).toBe('off');
    fireEvent.change(input, { target: { value: 'network' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cevabı kontrol et' }));
    await screen.findByText('network');
    expect(input.hasAttribute('disabled')).toBe(true);
  });
  it('shows four complete Turkish choices, freezes selection, and explains zero recognition credit', async () => {
    current = session('choice');
    mount();
    const options = await screen.findByRole('group', { name: 'Türkçe karşılık seçenekleri' });
    expect(within(options).getAllByRole('button')).toHaveLength(4);
    expect(document.activeElement).toBe(within(options).getAllByRole('button')[0]);
    fireEvent.click(within(options).getByRole('button', { name: 'ağ / iletişim ağı' }));
    await screen.findByText(/✓ Doğru karşılık/);
    expect(calls.find((c) => c.url.endsWith('/choice'))!.body).toMatchObject({
      optionId: 'a',
      questionId: 'q0',
      version: 0,
    });
    expect(
      within(options)
        .getAllByRole('button')
        .every((b) => b.hasAttribute('disabled')),
    ).toBe(true);
  });
  it('never auto-plays audio and only offers explicit no-penalty skip after unavailable audio', async () => {
    current = session('listening');
    mount();
    const play = await screen.findByRole('button', { name: 'Dinle' });
    expect(calls.some((c) => c.url.endsWith('/audio'))).toBe(false);
    expect(screen.queryByText('network')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Ses kullanılamıyor, soruyu atla' })).toBeNull();
    fireEvent.click(play);
    fireEvent.click(await screen.findByRole('button', { name: 'Ses kullanılamıyor, soruyu atla' }));
    await screen.findByText(/Bu soru doğru veya yanlış sayılmaz/);
  });
  it('advances within one mixed session instead of starting another activity', async () => {
    current = session('flashcard');
    current.questionCount = 4;
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Anlamları göster' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Bildim' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Sonraki soru' }));
    await screen.findByRole('textbox', { name: 'İngilizce cevabın' });
    expect(screen.getByText('Soru 2 / 4')).toBeTruthy();
    expect(calls.filter((c) => c.url.endsWith('/next'))).toHaveLength(1);
    expect(calls.some((c) => c.url === '/api/mixed')).toBe(false);
  });
  it('retains an unconfirmed command for identical retry after network failure', async () => {
    fail = true;
    mount();
    fireEvent.change(await screen.findByRole('textbox', { name: 'İngilizce cevabın' }), {
      target: { value: 'network' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Cevabı kontrol et' }));
    const retry = await screen.findByRole('button', { name: 'Tekrar dene' });
    fail = false;
    fireEvent.click(retry);
    await screen.findByText('network');
    const answers = calls.filter((c) => c.url.endsWith('/answers'));
    expect(answers[0]!.body).toEqual(answers[1]!.body);
  });
  it('rejects malformed mixed transport and permits self history only for mixed', () => {
    expect(isPracticeSession(session('choice'))).toBe(true);
    const invalid = session('choice');
    invalid.currentQuestion!.options = [];
    expect(isPracticeSession(invalid)).toBe(false);
    const activity = {
      kind: 'game',
      key: 'mixed',
      at: time,
      game: {
        id: 'history',
        wordListId: null,
        listTitle: 'List',
        gameType: 'mixed',
        items: [
          {
            wordId: null,
            english: 'network',
            meanings,
            outcome: 'self_known',
            attempts: 1,
            activityType: 'flashcard',
          },
        ],
      },
    };
    expect(isActivity(activity)).toBe(true);
    expect(isActivity({ ...activity, game: { ...activity.game, gameType: 'listening' } })).toBe(
      false,
    );
  });
  it('renders durable resolved state on refresh without repeating evaluation', async () => {
    current = session('written-recall');
    current.currentQuestion!.resolution = 'answered';
    current.currentQuestion!.evaluation = {
      answer: 'network',
      english: 'network',
      correct: true,
      masteryEligible: true,
      masteryApplied: false,
      feedback: 'target',
    };
    const first = mount();
    await screen.findByText('network');
    first.unmount();
    mount();
    await screen.findByText('network');
    await waitFor(() =>
      expect(calls.filter((c) => c.url === '/api/practice/mixed')).toHaveLength(2),
    );
    expect(calls.some((c) => c.url.endsWith('/answers'))).toBe(false);
  });
});
