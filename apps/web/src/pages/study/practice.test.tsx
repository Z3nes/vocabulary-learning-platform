import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PracticeEvaluation, PracticeSession } from '../../lib/practice';
import { isPracticeSession } from '../../lib/practice';
import { isActivity } from '../../lib/activity';
import type { StudySession } from '../../lib/study';
import HistoryPage from './HistoryPage';
import { WrittenSessionPage, WrittenSetupPage } from './WrittenRecallPage';
import { TargetedReviewPage } from './TargetedReviewPage';

const time = '2026-10-23T12:00:00Z';
const list = { id: 'list', title: 'Algorithms', wordCount: 250, createdAt: time, updatedAt: time };
const base: PracticeSession = {
  id: 'session',
  listId: 'list',
  listTitle: list.title,
  practiceType: 'written-recall',
  percentage: 25,
  eligibleCount: 250,
  questionCount: 63,
  currentPosition: 0,
  version: 0,
  status: 'ACTIVE',
  createdAt: time,
  completedAt: null,
  canceledAt: null,
  currentQuestion: {
    id: 'q1',
    position: 0,
    meanings: ['koşmak', 'çalışmak', 'yönetmek'],
    evaluation: null,
  },
  results: [],
  correctCount: 0,
  masteryEligibleCount: 0,
  masteryAppliedCount: 0,
};
const exact: PracticeEvaluation = {
  answer: 'run',
  english: 'run',
  correct: true,
  masteryEligible: true,
  masteryApplied: false,
  feedback: 'target',
};
let session: PracticeSession;
let active: PracticeSession | null;
let eligible: number;
let studyActive: StudySession | null;
let evaluation: PracticeEvaluation;
let failAnswer: boolean;
let client: QueryClient;
const calls: { url: string; method: string; body: unknown }[] = [];
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const study: StudySession = {
  id: 'review-session',
  listId: null,
  listTitle: 'Tüm listelerin',
  reviewOnly: true,
  direction: 'tr-en',
  percentage: 25,
  status: 'active',
  version: 0,
  startedAt: time,
  finishedAt: null,
  counts: { total: 1, known: 0, missed: 0, removed: 0, unanswered: 1 },
  currentCard: {
    id: 'card',
    appearance: 1,
    front: ['büyük'],
    back: ['big'],
    allowedActions: ['known', 'skip', 'missed'],
  },
  cards: [
    {
      id: 'card',
      wordId: 'word',
      english: 'big',
      meanings: ['büyük'],
      position: 0,
      skipped: false,
      outcome: null,
      answeredAt: null,
    },
  ],
};
beforeEach(() => {
  session = structuredClone(base);
  active = null;
  studyActive = null;
  eligible = 20;
  evaluation = exact;
  failAnswer = false;
  calls.length = 0;
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
        method = init?.method ?? 'GET';
      const body: unknown =
        typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined;
      calls.push({ url, method, body });
      if (url.endsWith('/practice/active')) return Promise.resolve(json({ session: active }));
      if (url.endsWith('/lists/list')) return Promise.resolve(json({ list }));
      if (url.endsWith('/lists/list/practice')) {
        active = session;
        return Promise.resolve(json({ session }, 201));
      }
      if (url.endsWith('/review/study-sessions/eligibility'))
        return Promise.resolve(json({ count: eligible }));
      if (url.includes('/review/study-sessions/active'))
        return Promise.resolve(json({ session: studyActive }));
      if (url.endsWith('/review/study-sessions'))
        return Promise.resolve(json({ session: study }, 201));
      if (url.endsWith('/answers')) {
        if (failAnswer) {
          failAnswer = false;
          return Promise.reject(new TypeError('offline'));
        }
        session = {
          ...session,
          version: session.version + 1,
          currentQuestion: { ...session.currentQuestion!, evaluation },
        };
        return Promise.resolve(json({ session, applied: true }));
      }
      if (url.endsWith('/next')) {
        session = {
          ...session,
          version: session.version + 1,
          currentPosition: 1,
          currentQuestion: { id: 'q2', position: 1, meanings: ['algoritma'], evaluation: null },
        };
        return Promise.resolve(json({ session, applied: true }));
      }
      if (url.endsWith('/cancel')) {
        active = null;
        session = { ...session, status: 'CANCELED', canceledAt: time, currentQuestion: null };
        return Promise.resolve(json({ session, applied: true }));
      }
      if (url.endsWith('/complete')) {
        session = {
          ...session,
          status: 'COMPLETED',
          completedAt: time,
          currentQuestion: null,
          correctCount: 1,
          masteryEligibleCount: 1,
          masteryAppliedCount: 1,
          results: [{ ...base.currentQuestion!, evaluation: { ...exact, masteryApplied: true } }],
        };
        return Promise.resolve(json({ session, applied: true }));
      }
      if (url.endsWith('/practice/session')) return Promise.resolve(json({ session }));
      return Promise.resolve(json({ error: { code: 'INTERNAL_ERROR' } }, 500));
    }),
  );
});
afterEach(() => {
  client.clear();
  vi.unstubAllGlobals();
});
function mount(path = '/study/practice/session') {
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/lists/:id/written" element={<WrittenSetupPage />} />
          <Route path="/study/practice/:sessionId" element={<WrittenSessionPage />} />
          <Route path="/study/review" element={<TargetedReviewPage />} />
          <Route path="/lists/:id/review" element={<TargetedReviewPage />} />
          <Route path="/study/sessions/:sessionId" element={<p>Existing flashcard engine</p>} />
          <Route path="/history" element={<HistoryPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
async function answer(text = 'run') {
  const input = await screen.findByRole('textbox', { name: 'İngilizce cevabın' });
  fireEvent.change(input, { target: { value: text } });
  fireEvent.click(screen.getByRole('button', { name: 'Cevabı kontrol et' }));
  await screen.findByText('Hedef İngilizce karşılık:');
  return input as HTMLInputElement;
}
const post = (suffix: string) => calls.filter((c) => c.method === 'POST' && c.url.endsWith(suffix));

describe('Yazılı Cevap setup and durable feedback', () => {
  it('offers all percentages and shows ceil counts before starting an uncapped session', async () => {
    mount('/lists/list/written');
    await screen.findByRole('button', { name: 'Başla' });
    for (const text of ['%15 · 38 soru', '%25 · 63 soru', '%50 · 125 soru', '%100 · 250 soru'])
      expect(screen.getByText(text)).toBeDefined();
    fireEvent.click(screen.getByRole('radio', { name: '%100 · 250 soru' }));
    expect(screen.getByText('Bu çalışma 250 sorudan oluşacak.')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Başla' }));
    await screen.findByRole('textbox');
    expect(post('/lists/list/practice')[0]!.body).toEqual({ percentage: 100 });
  });
  it('offers Devam Et and explicit confirmed cancellation without silently replacing a session', async () => {
    active = session;
    mount('/lists/list/written');
    const resume = await screen.findByRole('link', { name: 'Devam Et' });
    expect(resume.getAttribute('href')).toBe('/study/practice/session');
    expect(screen.queryByRole('button', { name: 'Başla' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'İptal Et' }));
    const dialog = screen.getByRole('dialog');
    expect(post('/cancel')).toHaveLength(0);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Devam Et' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(post('/cancel')).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'İptal Et' }));
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'İptali onayla' }),
    );
    await screen.findByRole('button', { name: 'Başla' });
    expect(post('/cancel')).toHaveLength(1);
  });
  it('shows every Turkish meaning with no answer hints before evaluation and disables keyboard assistance', async () => {
    mount();
    const input = await screen.findByRole('textbox', { name: 'İngilizce cevabın' });
    expect(screen.getByText('koşmak; çalışmak; yönetmek')).toBeDefined();
    expect(screen.getByRole('heading', { name: 'İngilizce karşılığını yaz' })).toBeDefined();
    expect(screen.queryByText('run')).toBeNull();
    for (const [attr, value] of Object.entries({
      autocapitalize: 'none',
      autocorrect: 'off',
      spellcheck: 'false',
      autocomplete: 'off',
      writingsuggestions: 'false',
    }))
      expect(input.getAttribute(attr)).toBe(value);
    expect(screen.queryByRole('button', { name: 'Örnek cümle göster' })).toBeNull();
    expect(calls.some((c) => c.url.includes('examples') || c.url.includes('tatoeba'))).toBe(false);
  });
  it('locks the first evaluated input and uses persisted authoritative correctness', async () => {
    mount();
    const input = await answer();
    expect(input.disabled).toBe(true);
    expect(screen.getByText('Doğru')).toBeDefined();
    expect(screen.getByText('run', { selector: 'strong' })).toBeDefined();
    expect(post('/answers')[0]!.body).toEqual({ questionId: 'q1', version: 0, answer: 'run' });
    expect(screen.queryByRole('button', { name: 'Cevabı kontrol et' })).toBeNull();
    expect(post('/complete')).toHaveLength(0);
  });
  it.each([
    {
      e: { ...exact, answer: 'jog', masteryEligible: false, feedback: 'alternative' as const },
      text: /kayıtlı anlamların tamamıyla eşleşiyor/,
    },
    {
      e: {
        ...exact,
        answer: 'operate',
        correct: false,
        masteryEligible: false,
        feedback: 'overlap' as const,
      },
      text: /Bu da bir karşılık olabilir/,
    },
    {
      e: {
        ...exact,
        answer: 'rnu',
        correct: false,
        masteryEligible: false,
        feedback: 'incorrect' as const,
      },
      text: /Hedef İngilizce karşılık:/,
    },
  ])('renders distinct persisted $e.feedback feedback', async ({ e, text }) => {
    evaluation = e;
    mount();
    await answer(e.answer);
    expect(screen.getByText(e.correct ? 'Doğru' : 'Yanlış')).toBeDefined();
    expect(screen.getByText(text)).toBeDefined();
    expect(screen.getByRole<HTMLInputElement>('textbox').disabled).toBe(true);
    if (e.feedback === 'incorrect')
      expect(screen.queryByText(/Bu da bir karşılık olabilir/)).toBeNull();
  });
  it('reloads the already evaluated question without exposing a second attempt', async () => {
    const first = mount();
    await answer();
    first.unmount();
    client.clear();
    mount();
    const input = await screen.findByRole<HTMLInputElement>('textbox');
    expect(input.disabled).toBe(true);
    expect(screen.getByText('Doğru')).toBeDefined();
    expect(post('/answers')).toHaveLength(1);
  });
  it('advances through the server then focuses a fresh empty input', async () => {
    mount();
    await answer();
    fireEvent.click(screen.getByRole('button', { name: 'Sonraki soru' }));
    await screen.findByText('algoritma');
    const input = screen.getByRole<HTMLInputElement>('textbox');
    expect(input.value).toBe('');
    expect(input.disabled).toBe(false);
    expect(document.activeElement).toBe(input);
    expect(post('/next')[0]!.body).toEqual({ questionId: 'q1', version: 1 });
  });
  it('does not submit during IME composition, supports form submission and guards double clicks', async () => {
    mount();
    const input = await screen.findByRole('textbox');
    fireEvent.change(input, { target: { value: 'run' } });
    fireEvent.compositionStart(input);
    fireEvent.submit(input.closest('form')!);
    expect(post('/answers')).toHaveLength(0);
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true });
    expect(post('/answers')).toHaveLength(0);
    fireEvent.compositionEnd(input);
    const button = screen.getByRole('button', { name: 'Cevabı kontrol et' });
    fireEvent.click(button);
    fireEvent.click(button);
    await screen.findByText('Doğru');
    expect(post('/answers')).toHaveLength(1);
  });
  it('keeps an unknown network result locked and retries the identical answer', async () => {
    failAnswer = true;
    mount();
    const input = await screen.findByRole('textbox');
    fireEvent.change(input, { target: { value: 'run' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cevabı kontrol et' }));
    await screen.findByRole('alert');
    expect((input as HTMLInputElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Tekrar dene' }));
    await screen.findByText('Doğru');
    expect(post('/answers')).toHaveLength(2);
    expect(post('/answers')[1]!.body).toEqual(post('/answers')[0]!.body);
  });
  it('shows completion counts and separates applied mastery from game correctness', async () => {
    session = { ...session, questionCount: 1, eligibleCount: 1 };
    mount();
    await answer();
    fireEvent.click(screen.getByRole('button', { name: 'Çalışmayı tamamla' }));
    const done = await screen.findByRole('heading', { name: 'Çalışmayı tamamladın' });
    // The finish button is gone, so focus moves to the result instead of the page body.
    expect(document.activeElement).toBe(done);
    expect(screen.getByText('1 soru · Doğru: 1 · Yanlış: 0')).toBeDefined();
    expect(screen.getByText(/Uygulanan öğrenme katkısı: 1/)).toBeDefined();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(post('/complete')).toHaveLength(1);
  });
  it('renders canceled sessions without a submission or completion action', async () => {
    session = { ...session, status: 'CANCELED', currentQuestion: null, canceledAt: time };
    mount();
    await screen.findByText('Çalışman iptal edildi. Öğrenme katkısı uygulanmadı.');
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Çalışmayı tamamla' })).toBeNull();
  });
});

describe('targeted review entry points', () => {
  it.each(['/study/review', '/lists/list/review'])(
    'uses active eligibility and percentage in scope %s',
    async (path) => {
      mount(path);
      await screen.findByRole('button', { name: 'Çalışmaya başla' });
      expect(screen.getByText('%15 · 3 kart')).toBeDefined();
      fireEvent.click(screen.getByRole('radio', { name: '%50 · 10 kart' }));
      expect(screen.getByText('Bu çalışma 10 karttan oluşacak.')).toBeDefined();
      expect(screen.queryByRole('radio', { name: /soru/ })).toBeNull();
      fireEvent.keyDown(screen.getByRole('combobox', { name: 'Çalışma yönü' }), { key: 'End' });
      fireEvent.keyDown(screen.getByRole('combobox', { name: 'Çalışma yönü' }), { key: 'Enter' });
      fireEvent.click(screen.getByRole('button', { name: 'Çalışmaya başla' }));
      await screen.findByText('Existing flashcard engine');
      const listId = path.startsWith('/lists') ? 'list' : null;
      expect(post('/review/study-sessions')[0]!.body).toEqual({
        listId,
        percentage: 50,
        direction: 'tr-en',
      });
      expect(post('/review/study-sessions/eligibility')[0]!.body).toEqual({ listId });
    },
  );
  it('shows an informative empty eligible pool without starting unrelated cards', async () => {
    eligible = 0;
    mount('/study/review');
    await screen.findByText(/şu anda tekrar önceliği olan kelimen yok/);
    expect(screen.queryByRole('button', { name: 'Çalışmaya başla' })).toBeNull();
    expect(post('/review/study-sessions')).toHaveLength(0);
  });
  it('resumes an all-lists session even when eligible priority has since cleared', async () => {
    eligible = 0;
    studyActive = study;
    mount('/study/review');
    expect((await screen.findByRole('link', { name: 'Devam Et' })).getAttribute('href')).toBe(
      '/study/sessions/review-session',
    );
    expect(screen.queryByRole('button', { name: 'Çalışmaya başla' })).toBeNull();
  });
});

describe('persistent history and response validation', () => {
  it('accepts uncapped written recall history while retaining original game limits', () => {
    const item = {
      wordId: null,
      english: 'run',
      meanings: ['koşmak'],
      outcome: 'correct',
      attempts: 1,
    };
    const activity = {
      key: 'game:g',
      at: time,
      kind: 'game',
      game: {
        id: 'g',
        wordListId: null,
        listTitle: 'Snapshot',
        gameType: 'written-recall',
        items: Array.from({ length: 250 }, () => item),
      },
    };
    expect(isActivity(activity)).toBe(true);
    expect(isActivity({ ...activity, game: { ...activity.game, gameType: 'quiz' } })).toBe(false);
    expect(isPracticeSession(base)).toBe(true);
    expect(
      isPracticeSession({
        ...base,
        currentQuestion: { ...base.currentQuestion, evaluation: { ...exact, correct: 'yes' } },
      }),
    ).toBe(false);
  });
  it('uses the permanent history label and explains asymmetric learning credit', async () => {
    const response = {
      activities: [
        {
          key: 'game:g',
          at: time,
          kind: 'game',
          game: {
            id: 'g',
            wordListId: null,
            listTitle: 'Snapshot',
            gameType: 'written-recall',
            items: [
              {
                wordId: null,
                english: 'run',
                meanings: ['koşmak'],
                outcome: 'correct',
                attempts: 1,
              },
            ],
          },
        },
      ],
    };
    vi.mocked(fetch).mockResolvedValue(json(response));
    mount('/history');
    await screen.findByRole('heading', { name: 'Yazılı Cevap · Snapshot' });
    expect(screen.getByText(/Yalnızca hedefi doğru yazdığın cevaplar/)).toBeDefined();
  });
  it('invalid server state produces a recoverable error instead of client evaluation', async () => {
    vi.mocked(fetch).mockResolvedValue(json({ session: { ...base, status: 'unknown' } }));
    mount();
    await screen.findByRole('alert');
    expect(screen.queryByRole('textbox')).toBeNull();
  });
  it('unmounting an active game does not issue cancellation or completion', async () => {
    const page = mount();
    await screen.findByRole('textbox');
    page.unmount();
    await act(() => Promise.resolve());
    expect(post('/cancel')).toHaveLength(0);
    expect(post('/complete')).toHaveLength(0);
  });
});
