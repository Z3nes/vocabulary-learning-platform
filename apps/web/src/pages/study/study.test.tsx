import { routerReady } from '../../test/routerReady';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WordList } from '../../lib/lists';
import {
  estimatedCardCount,
  isStudySession,
  type StudyAction,
  type StudyDirection,
  type StudyOutcome,
  type StudySession,
} from '../../lib/study';
import { buildRoutes } from '../../router';
import { actionSlots } from './studyFormat';

// Study UI against a mocked network. The fake server below follows the Session 5A
// response contract (apps/api/src/study/view.ts and queue.ts) so the pages are tested
// with realistic transitions: queue order, skip/remove, versions, replays, conflicts.

interface FakeCard {
  id: string;
  wordId: string | null;
  english: string;
  meanings: string[];
  position: number;
  queueOrder: number;
  skipped: boolean;
  outcome: StudyOutcome | null;
  answeredAt: string | null;
}
interface FakeSession {
  id: string;
  listId: string;
  listTitle: string;
  direction: StudyDirection;
  percentage: 15 | 25 | 50 | 100;
  status: 'active' | 'completed' | 'ended_early';
  version: number;
  startedAt: string;
  finishedAt: string | null;
  cards: FakeCard[];
}
const outcomeOf = { known: 'known', missed: 'missed', remove: 'removed' } as const;
const vocabulary: [string, string[]][] = [
  ['run', ['koşmak', 'çalıştırmak', 'yönetmek']],
  ['resilient', ['dayanıklı', 'esnek']],
  ['take into account', ['hesaba katmak']],
];

function makeSession(
  id: string,
  listId: string,
  options: Partial<Pick<FakeSession, 'direction' | 'percentage'>> = {},
  words = vocabulary,
): FakeSession {
  return {
    id,
    listId,
    listTitle: lists[listId]?.title ?? 'Liste',
    direction: options.direction ?? 'en-tr',
    percentage: options.percentage ?? 100,
    status: 'active',
    version: 0,
    startedAt: '2026-10-22T09:00:00Z',
    finishedAt: null,
    cards: words.map(([english, meanings], position) => ({
      id: `${id}-card-${position}`,
      wordId: `word-${position}`,
      english,
      meanings,
      position,
      queueOrder: position,
      skipped: false,
      outcome: null,
      answeredAt: null,
    })),
  };
}
const currentOf = (session: FakeSession) =>
  session.cards
    .filter((card) => card.outcome === null)
    .sort((a, b) => a.queueOrder - b.queueOrder)[0];
function view(session: FakeSession): StudySession {
  const count = (outcome: StudyOutcome | null) =>
    session.cards.filter((card) => card.outcome === outcome).length;
  const current = session.status === 'active' ? currentOf(session) : undefined;
  const en = session.direction === 'en-tr';
  return {
    id: session.id,
    listId: session.listId,
    listTitle: session.listTitle,
    direction: session.direction,
    percentage: session.percentage,
    status: session.status,
    version: session.version,
    startedAt: session.startedAt,
    finishedAt: session.finishedAt,
    counts: {
      total: session.cards.length,
      known: count('known'),
      missed: count('missed'),
      removed: count('removed'),
      unanswered: count(null),
    },
    currentCard: current
      ? {
          id: current.id,
          appearance: current.skipped ? 2 : 1,
          front: en ? [current.english] : current.meanings,
          back: en ? current.meanings : [current.english],
          allowedActions: current.skipped
            ? ['known', 'remove', 'missed']
            : ['known', 'skip', 'missed'],
        }
      : null,
    cards: [...session.cards]
      .sort((a, b) => a.position - b.position)
      .map(({ queueOrder: _queueOrder, ...card }) => card),
  };
}
const fail = (status: number, code: string) => ({ status, body: { error: { code } } });
/** The server's card action rules (mirrors planAction). */
function serverAct(
  session: FakeSession,
  input: { cardId: string; version: number; action: StudyAction },
) {
  const card = session.cards.find((candidate) => candidate.id === input.cardId);
  if (!card) return fail(404, 'STUDY_CARD_NOT_FOUND');
  const replay = { status: 200, body: { session: view(session), applied: false } };
  if (input.action === 'skip') {
    if (card.skipped && (card.outcome !== null || input.version !== session.version)) return replay;
  } else if (card.outcome !== null) {
    return card.outcome === outcomeOf[input.action]
      ? replay
      : fail(409, 'STUDY_CARD_ALREADY_ANSWERED');
  }
  if (session.status !== 'active') return fail(409, 'STUDY_SESSION_FINISHED');
  if (input.version !== session.version || currentOf(session) !== card)
    return fail(409, 'STUDY_SESSION_STALE');
  const allowed = card.skipped ? ['known', 'remove', 'missed'] : ['known', 'skip', 'missed'];
  if (!allowed.includes(input.action)) return fail(409, 'STUDY_ACTION_NOT_ALLOWED');
  if (input.action === 'skip') {
    card.skipped = true;
    card.queueOrder = Math.max(...session.cards.map((other) => other.queueOrder)) + 1;
  } else {
    card.outcome = outcomeOf[input.action];
    card.answeredAt = '2026-10-22T09:05:00Z';
    if (!currentOf(session)) {
      session.status = 'completed';
      session.finishedAt = '2026-10-22T09:10:00Z';
    }
  }
  session.version += 1;
  return { status: 200, body: { session: view(session), applied: true } };
}

const list = (id: string, title: string, wordCount: number): WordList => ({
  id,
  title,
  wordCount,
  createdAt: '2026-10-21T10:00:00Z',
  updatedAt: '2026-10-21T10:00:00Z',
});
let lists: Record<string, WordList>;
let sessions: Record<string, FakeSession>;
let nextSession: (
  listId: string,
  body: { percentage: 15; direction: StudyDirection },
) => FakeSession;
let calls: { method: string; url: string; body?: unknown }[];
let hold: (method: string, url: string) => boolean;
let held: (() => void)[];
/** Applies the request on the server, then loses the response (connection dropped). */
let dropResponse: (method: string, url: string) => boolean;
let startFailure: { status: number; code: string } | null;

const json = ({ status, body }: { status: number; body: unknown }) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const ok = (body: unknown) => ({ status: 200, body });

function respond(method: string, url: string, body: unknown): { status: number; body: unknown } {
  const path = url.replace(/^\/api/, '');
  if (/\/cards\/[^/]+\/examples(?:\?|$)/u.test(path))
    return ok({
      examples: [
        {
          id: '42',
          text: 'We ran home.',
          provider: 'Tatoeba',
          matchedForm: 'ran',
          contributor: 'Writer',
          sourceUrl: 'https://tatoeba.org/en/sentences/show/42',
          license: { name: 'CC BY 2.0 FR', url: 'https://creativecommons.org/licenses/by/2.0/fr/' },
        },
      ],
    });
  let match: RegExpExecArray | null;
  if (path === '/lists') return ok({ lists: Object.values(lists) });
  if ((match = /^\/lists\/([^/]+)$/.exec(path)))
    return lists[match[1]!] ? ok({ list: lists[match[1]!] }) : fail(404, 'LIST_NOT_FOUND');
  if ((match = /^\/lists\/([^/]+)\/words$/.exec(path))) return ok({ words: [] });
  if ((match = /^\/lists\/([^/]+)\/study-sessions\/active$/.exec(path))) {
    if (!lists[match[1]!]) return fail(404, 'LIST_NOT_FOUND');
    const active = Object.values(sessions).find(
      (session) => session.listId === match![1] && session.status === 'active',
    );
    return ok({ session: active ? view(active) : null });
  }
  if ((match = /^\/lists\/([^/]+)\/study-sessions$/.exec(path)) && method === 'POST') {
    const listId = match[1]!;
    if (!lists[listId]) return fail(404, 'LIST_NOT_FOUND');
    if (Object.values(sessions).some((s) => s.listId === listId && s.status === 'active'))
      return fail(409, 'STUDY_SESSION_ACTIVE');
    if (!lists[listId].wordCount) return fail(409, 'STUDY_LIST_EMPTY');
    if (startFailure) return fail(startFailure.status, startFailure.code);
    const created = nextSession(listId, body as { percentage: 15; direction: StudyDirection });
    sessions[created.id] = created;
    return { status: 201, body: { session: view(created) } };
  }
  if ((match = /^\/study-sessions\/([^/]+)(\/actions|\/end)?$/.exec(path))) {
    const session = sessions[match[1]!];
    if (!session) return fail(404, 'STUDY_SESSION_NOT_FOUND');
    if (!match[2]) return ok({ session: view(session) });
    if (match[2] === '/actions')
      return serverAct(session, body as { cardId: string; version: number; action: StudyAction });
    if (session.status === 'completed') return fail(409, 'STUDY_SESSION_FINISHED');
    if (session.status === 'ended_early') return ok({ session: view(session), applied: false });
    session.status = 'ended_early';
    session.finishedAt = '2026-10-22T09:20:00Z';
    session.version += 1;
    return ok({ session: view(session), applied: true });
  }
  return fail(500, 'INTERNAL_ERROR');
}

const fetchMock = vi.fn((url: string, options?: RequestInit) => {
  const method = options?.method ?? 'GET';
  const body =
    typeof options?.body === 'string' ? (JSON.parse(options.body) as unknown) : undefined;
  calls.push({ method, url, body });
  if (dropResponse(method, url)) {
    respond(method, url, body);
    return Promise.reject(new TypeError('Failed to fetch'));
  }
  const answer = () => json(respond(method, url, body));
  return hold(method, url)
    ? new Promise<Response>((resolve) => held.push(() => resolve(answer())))
    : Promise.resolve(answer());
});

const L1 = 'list-algorithms';
const EMPTY = 'list-empty';
beforeEach(() => {
  lists = { [L1]: list(L1, 'Algorithms', 7), [EMPTY]: list(EMPTY, 'Boş liste', 0) };
  sessions = {};
  nextSession = (listId, body) =>
    makeSession(`s-${Object.keys(sessions).length + 1}`, listId, body);
  calls = [];
  hold = () => false;
  held = [];
  dropResponse = () => false;
  startFailure = null;
  fetchMock.mockClear();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

async function open(path: string) {
  const router = createMemoryRouter(buildRoutes({ includeDevRoutes: false }), {
    basename: '/kelime',
    initialEntries: [`/kelime${path}`],
  });
  await routerReady(router);
  render(<RouterProvider router={router} />);
  return router;
}
const posts = (suffix: string) =>
  calls.filter((call) => call.method === 'POST' && call.url.endsWith(suffix));
const actionGroup = () => within(screen.getByRole('group', { name: 'Kartı değerlendir' }));
const actionLabels = () =>
  actionGroup()
    .getAllByRole('button')
    .map((button) => button.textContent);
/** By visible label; a busy button's name also includes "(kaydediliyor)". */
const press = (name: string) =>
  fireEvent.click(actionGroup().getByRole('button', { name: new RegExp(`^${name}`) }));
const progressText = () =>
  screen.getByRole('progressbar', { name: 'Çalışma ilerlemesi' }).getAttribute('aria-valuetext');
const frontText = () => screen.getByRole('region', { name: /İngilizce|Türkçe anlamları/ });
async function openActive(session = makeSession('s-a', L1)) {
  sessions[session.id] = session;
  const router = await open(`/study/sessions/${session.id}`);
  await screen.findByRole('group', { name: 'Kartı değerlendir' });
  return router;
}
function releaseHeld() {
  const pending = held;
  held = [];
  act(() => pending.forEach((release) => release()));
}

describe('study helpers', () => {
  it('estimates card counts like the backend (rounded up, never above the list)', () => {
    expect([15, 25, 50, 100].map((p) => estimatedCardCount(7, p as 15))).toEqual([2, 2, 4, 7]);
    expect(estimatedCardCount(10, 25)).toBe(3);
    expect(estimatedCardCount(100, 15)).toBe(15);
    expect(estimatedCardCount(150, 15)).toBe(23);
    expect(estimatedCardCount(1, 15)).toBe(1);
  });

  it('keeps the fixed button order for both appearances', () => {
    const order = (allowedActions: StudyAction[]) =>
      actionSlots({ allowedActions }).map((slot) => slot.action);
    expect(order(['known', 'skip', 'missed'])).toEqual(['known', 'skip', 'missed']);
    // Even if a response listed them differently, the display order is fixed.
    expect(order(['missed', 'remove', 'known'])).toEqual(['known', 'remove', 'missed']);
  });

  it('rejects malformed session responses', () => {
    const valid = view(makeSession('s', L1));
    expect(isStudySession(valid)).toBe(true);
    expect(isStudySession({ ...valid, currentCard: null })).toBe(false);
    expect(isStudySession({ ...valid, percentage: 30 })).toBe(false);
    expect(isStudySession({ ...valid, cards: valid.cards.slice(1) })).toBe(false);
    expect(isStudySession({ ...valid, status: 'completed' })).toBe(false);
  });
});

describe('study setup', () => {
  it('shows the list, four sizes with rounded-up counts and both directions, then starts', async () => {
    const router = await open(`/lists/${L1}/study`);
    expect(await screen.findByRole('heading', { level: 1, name: 'Kelime kartlarıyla çalış' }));
    await screen.findByRole('radio', { name: /%15/ });
    expect(screen.getByText('Algorithms')).toBeDefined();
    expect(screen.getByText(/7\s+kelime/)).toBeDefined();
    const sizes = within(screen.getByRole('group', { name: 'Çalışma boyutu' }));
    expect(sizes.getAllByRole('radio').map((radio) => radio.closest('label')!.textContent)).toEqual(
      ['%152 kart', '%252 kart', '%504 kart', '%1007 kart'],
    );
    expect(sizes.getByRole<HTMLInputElement>('radio', { name: /%25/ }).checked).toBe(true);
    const directions = within(screen.getByRole('group', { name: 'Çalışma yönü' }));
    expect(
      directions.getAllByRole('radio').map((radio) => radio.closest('label')!.textContent),
    ).toEqual([
      expect.stringContaining('İngilizce → Türkçe'),
      expect.stringContaining('Türkçe → İngilizce'),
    ]);

    fireEvent.click(sizes.getByRole('radio', { name: /%15/ }));
    fireEvent.click(directions.getByRole('radio', { name: /Türkçe → İngilizce/ }));
    expect(screen.getByText('Bu çalışma 2 karttan oluşacak.')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Çalışmaya başla' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/kelime/study/sessions/s-1'));
    expect(posts('/study-sessions').map((call) => call.body)).toEqual([
      { percentage: 15, direction: 'tr-en' },
    ]);
    expect(await screen.findByRole('heading', { level: 1, name: 'Algorithms' })).toBeDefined();
    // TR→EN: every Turkish meaning is the prompt.
    expect(
      within(frontText())
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['koşmak', 'çalıştırmak', 'yönetmek']);
  });

  it('explains an empty list and links back to it instead of offering a start', async () => {
    await open(`/lists/${EMPTY}/study`);
    expect(await screen.findByRole('heading', { name: 'Bu listede henüz kelime yok' }));
    expect(screen.queryByRole('button', { name: 'Çalışmaya başla' })).toBeNull();
    expect(
      screen.getByRole('link', { name: 'Listeye dön ve kelime ekle' }).getAttribute('href'),
    ).toBe(`/kelime/lists/${EMPTY}`);
  });

  it('sends one start request while pending and shows a failure without leaving the page', async () => {
    hold = (method, url) => method === 'POST' && url.endsWith('/study-sessions');
    const router = await open(`/lists/${L1}/study`);
    const button = await screen.findByRole('button', { name: 'Çalışmaya başla' });
    fireEvent.click(button);
    fireEvent.click(button);
    fireEvent.click(button);
    await waitFor(() => expect(held).toHaveLength(1));
    expect(posts('/study-sessions')).toHaveLength(1);
    expect(button.getAttribute('aria-busy')).toBe('true');

    // The held request fails on the server.
    startFailure = { status: 500, code: 'INTERNAL_ERROR' };
    releaseHeld();
    expect((await screen.findByRole('alert')).textContent).toBe(
      'İşlemin tamamlanamadı. Biraz sonra tekrar dene.',
    );
    expect(screen.getByRole('button', { name: 'Çalışmaya başla' })).toBeDefined();
    expect(router.state.location.pathname).toBe(`/kelime/lists/${L1}/study`);
  });

  it('switches to the empty state when the list was emptied before starting', async () => {
    await open(`/lists/${L1}/study`);
    const button = await screen.findByRole('button', { name: 'Çalışmaya başla' });
    lists[L1] = { ...lists[L1]!, wordCount: 0 };
    fireEvent.click(button);
    expect(await screen.findByRole('heading', { name: 'Bu listede henüz kelime yok' }));
    expect(Object.keys(sessions)).toEqual([]);
  });

  it('reports a deleted or foreign list', async () => {
    await open('/lists/list-gone/study');
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Bu listeye ulaşılamıyor. Listelerine dönüp tekrar dene.',
    );
    expect(screen.queryByRole('button', { name: 'Çalışmaya başla' })).toBeNull();
  });

  it('shows a network failure when starting', async () => {
    dropResponse = (method) => method === 'POST';
    nextSession = (listId, body) => makeSession('s-net', listId, body);
    await open(`/lists/${L1}/study`);
    fireEvent.click(await screen.findByRole('button', { name: 'Çalışmaya başla' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/Sunucuya ulaşılamıyor/);
  });

  it('offers to resume or end an existing session and never starts over it', async () => {
    const existing = makeSession('s-old', L1, { percentage: 50 });
    serverAct(existing, { cardId: 's-old-card-0', version: 0, action: 'known' });
    sessions[existing.id] = existing;
    await open(`/lists/${L1}/study`);
    expect(await screen.findByRole('heading', { name: 'Yarım kalan bir çalışman var' }));
    expect(
      screen.getByText(/İngilizce → Türkçe · %50 · 3 kart\. Tamamlanan 1 \/ 3\./),
    ).toBeDefined();
    expect(screen.getByRole('link', { name: 'Çalışmaya devam et' }).getAttribute('href')).toBe(
      '/kelime/study/sessions/s-old',
    );
    expect(screen.queryByRole('button', { name: 'Çalışmaya başla' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Çalışmayı bitir' }));
    const dialog = await screen.findByRole('dialog', { name: 'Çalışmayı bitirmek istiyor musun?' });
    expect(dialog.textContent).toMatch(/değerlendirdiğin 1 kart kaydedildi/);
    expect(dialog.textContent).toMatch(/2 kart "Bilemedim" sayılmaz/);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Çalışmayı bitir' }));

    expect(await screen.findByRole('button', { name: 'Çalışmaya başla' })).toBeDefined();
    expect(posts('/end').map((call) => call.url)).toEqual(['/api/study-sessions/s-old/end']);
    expect(screen.getByText('Önceki çalışmanı bitirdin. Verdiğin cevaplar kaydedildi.'));
    expect(
      screen.getByRole('link', { name: 'Önceki çalışmanın sonuçlarını gör' }).getAttribute('href'),
    ).toBe('/kelime/study/sessions/s-old/summary');
    expect(existing.cards[0]!.outcome).toBe('known');
  });

  it('switches to the resume panel when another device started a session meanwhile', async () => {
    await open(`/lists/${L1}/study`);
    const button = await screen.findByRole('button', { name: 'Çalışmaya başla' });
    sessions['s-other'] = makeSession('s-other', L1);
    fireEvent.click(button);
    expect(await screen.findByRole('heading', { name: 'Yarım kalan bir çalışman var' }));
    expect(screen.getByRole('link', { name: 'Çalışmaya devam et' }).getAttribute('href')).toBe(
      '/kelime/study/sessions/s-other',
    );
    expect(Object.keys(sessions)).toEqual(['s-other']);
  });
});

describe('flashcards', () => {
  it.each(['en-tr', 'tr-en'] as const)(
    '%s: example sentences remain absent before and after reveal and evaluation',
    async (direction) => {
      const session = makeSession('s-examples', L1, { direction });
      await openActive(session);
      const before = structuredClone(session);
      expect(screen.queryByRole('button', { name: 'Örnek cümle göster' })).toBeNull();
      expect(calls.some((call) => call.url.includes('/examples'))).toBe(false);
      fireEvent.click(screen.getByRole('button', { name: 'Cevabı göster' }));
      expect(calls.some((call) => call.url.includes('/examples'))).toBe(false);
      expect(screen.queryByRole('button', { name: 'Örnek cümle göster' })).toBeNull();
      expect(calls.filter((call) => call.method === 'POST')).toHaveLength(0);
      expect(sessions[session.id]).toEqual(before);
      expect(actionLabels()).toEqual(['Bildim', 'Atla', 'Bilemedim']);
      expect(progressText()).toBe('Tamamlanan 0 / 3');
      press('Bildim');
      await waitFor(() => expect(progressText()).toBe('Tamamlanan 1 / 3'));
      expect(screen.queryByText('We ran home.')).toBeNull();
      expect(screen.queryByRole('button', { name: 'Örnek cümle göster' })).toBeNull();
      expect(calls.some((call) => call.url.includes('/examples'))).toBe(false);
      expect(posts('/actions')).toHaveLength(1);
    },
  );

  it('never requests examples while advancing to another card', async () => {
    await openActive();
    fireEvent.click(screen.getByRole('button', { name: 'Cevabı göster' }));
    press('Bilemedim');
    await waitFor(() => expect(progressText()).toBe('Tamamlanan 1 / 3'));
    expect(screen.queryByText('We ran home.')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Örnek cümle göster' })).toBeNull();
    expect(calls.some((call) => call.url.includes('/examples'))).toBe(false);
    expect(posts('/actions').map((call) => call.body)).toEqual([
      { cardId: 's-a-card-0', version: 0, action: 'missed' },
    ]);
  });

  it('requires reveal again after skip and offers no example controls', async () => {
    await openActive(makeSession('s-single', L1, {}, [vocabulary[0]!]));
    fireEvent.click(screen.getByRole('button', { name: 'Cevabı göster' }));
    press('Atla');
    await waitFor(() => expect(actionLabels()).toEqual(['Bildim', 'Çıkar', 'Bilemedim']));
    expect(screen.queryByText('We ran home.')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Örnek cümle göster' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Cevabı göster' })).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Cevabı göster' }));
    expect(calls.some((call) => call.url.includes('/examples'))).toBe(false);
  });
  it('EN→TR: hides the answer until asked, shows every meaning, and the reveal is optional', async () => {
    await openActive();
    expect(within(frontText()).getByText('run').getAttribute('lang')).toBe('en');
    // The answer is not in the DOM (nor the accessibility tree) before it is requested.
    expect(screen.queryByText('koşmak')).toBeNull();
    const reveal = screen.getByRole('button', { name: 'Cevabı göster' });
    expect(reveal.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(reveal);
    expect(reveal.getAttribute('aria-expanded')).toBe('true');
    expect(reveal.textContent).toBe('Cevabı gizle');
    for (const meaning of ['koşmak', 'çalıştırmak', 'yönetmek'])
      expect(screen.getByText(meaning)).toBeDefined();
    expect(calls.filter((call) => call.method === 'POST')).toHaveLength(0);

    press('Bildim');
    await waitFor(() => expect(within(frontText()).getByText('resilient')).toBeDefined());
    // A new card starts hidden; the next card is answered without revealing.
    expect(screen.getByRole('button', { name: 'Cevabı göster' })).toBeDefined();
    expect(screen.queryByText('dayanıklı')).toBeNull();
    press('Bilemedim');
    await waitFor(() => expect(progressText()).toBe('Tamamlanan 2 / 3'));
    expect(posts('/actions').map((call) => call.body)).toEqual([
      { cardId: 's-a-card-0', version: 0, action: 'known' },
      { cardId: 's-a-card-1', version: 1, action: 'missed' },
    ]);
  });

  it('TR→EN: every Turkish meaning is the prompt and the English text is the answer', async () => {
    await openActive(makeSession('s-tr', L1, { direction: 'tr-en' }));
    expect(screen.getByText(/Türkçe → İngilizce · %100 · 3 kart/)).toBeDefined();
    expect(
      within(frontText())
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['koşmak', 'çalıştırmak', 'yönetmek']);
    expect(screen.queryByText('run')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Cevabı göster' }));
    expect(screen.getByText('run').getAttribute('lang')).toBe('en');
  });

  it('keeps Bildim | Atla | Bilemedim, brings a skipped card back with Çıkar, and never deletes words', async () => {
    const router = await openActive();
    expect(actionLabels()).toEqual(['Bildim', 'Atla', 'Bilemedim']);
    press('Atla');
    await waitFor(() => expect(within(frontText()).getByText('resilient')).toBeDefined());
    expect(progressText()).toBe('Tamamlanan 0 / 3');
    expect(screen.getByText('Atladığın 1 kart, diğer kartlardan sonra bir kez daha gelecek.'));
    expect(actionLabels()).toEqual(['Bildim', 'Atla', 'Bilemedim']);
    press('Bildim');
    await waitFor(() => expect(within(frontText()).getByText('take into account')).toBeDefined());
    press('Bilemedim');

    // The skipped card returns once, now with Çıkar in the middle.
    await waitFor(() => expect(within(frontText()).getByText('run')).toBeDefined());
    expect(actionLabels()).toEqual(['Bildim', 'Çıkar', 'Bilemedim']);
    expect(screen.getByText('Atladığın kart')).toBeDefined();
    expect(screen.getByText(/Çıkarmak kelimeni listenden silmez/)).toBeDefined();
    // The returned card is on screen, so nothing is "coming back later" any more.
    expect(screen.queryByText(/bir kez daha gelecek/)).toBeNull();
    expect(progressText()).toBe('Tamamlanan 2 / 3');
    press('Çıkar');

    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/kelime/study/sessions/s-a/summary'),
    );
    expect(posts('/actions').map((call) => (call.body as { action: string }).action)).toEqual([
      'skip',
      'known',
      'missed',
      'remove',
    ]);
    expect(calls.some((call) => call.method === 'DELETE')).toBe(false);
    expect(await screen.findByRole('heading', { level: 1, name: 'Çalışmayı tamamladın' }));
  });

  it('ignores repeated clicks while an action is pending, without moving focus', async () => {
    await openActive();
    hold = (method) => method === 'POST';
    const known = actionGroup().getByRole('button', { name: /^Bildim/ });
    known.focus();
    press('Bildim');
    press('Bildim');
    press('Bilemedim');
    press('Atla');
    await waitFor(() => expect(held).toHaveLength(1));
    press('Bildim');
    expect(posts('/actions')).toHaveLength(1);
    expect(known.getAttribute('aria-busy')).toBe('true');
    for (const button of actionGroup().getAllByRole('button'))
      expect(button.getAttribute('aria-disabled')).toBe('true');
    releaseHeld();
    await waitFor(() => expect(within(frontText()).getByText('resilient')).toBeDefined());
    expect(document.activeElement).toBe(actionGroup().getByRole('button', { name: 'Bildim' }));
    expect(progressText()).toBe('Tamamlanan 1 / 3');
    expect(sessions['s-a']!.cards.map((card) => card.outcome)).toEqual(['known', null, null]);
  });

  it('after a lost response, retries the exact same request and never records it twice', async () => {
    await openActive();
    dropResponse = (method) => method === 'POST';
    press('Bilemedim');
    expect((await screen.findByRole('alert')).textContent).toMatch(/Sunucuya ulaşılamıyor/);
    // The server did record it, but the page cannot know: the buttons wait for a retry.
    expect(sessions['s-a']!.cards[0]!.outcome).toBe('missed');
    expect(
      actionGroup().getByRole('button', { name: 'Bildim' }).getAttribute('aria-disabled'),
    ).toBe('true');
    press('Bildim');
    expect(posts('/actions')).toHaveLength(1);

    dropResponse = () => false;
    fireEvent.click(screen.getByRole('button', { name: 'Tekrar dene' }));
    await waitFor(() => expect(within(frontText()).getByText('resilient')).toBeDefined());
    expect(posts('/actions').map((call) => call.body)).toEqual([
      { cardId: 's-a-card-0', version: 0, action: 'missed' },
      { cardId: 's-a-card-0', version: 0, action: 'missed' },
    ]);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(progressText()).toBe('Tamamlanan 1 / 3');
    expect(sessions['s-a']!.version).toBe(1);
  });

  it('can reload the server state instead of retrying', async () => {
    await openActive();
    dropResponse = (method) => method === 'POST';
    press('Bildim');
    await screen.findByRole('alert');
    dropResponse = () => false;
    fireEvent.click(screen.getByRole('button', { name: 'Güncel durumu yükle' }));
    await waitFor(() => expect(within(frontText()).getByText('resilient')).toBeDefined());
    expect(screen.queryByRole('alert')).toBeNull();
    expect(
      actionGroup().getByRole('button', { name: 'Bildim' }).hasAttribute('aria-disabled'),
    ).toBe(false);
  });

  it('explains a change made elsewhere and shows the latest card instead of overwriting', async () => {
    await openActive();
    // Another tab answers the first card.
    serverAct(sessions['s-a']!, { cardId: 's-a-card-0', version: 0, action: 'known' });
    press('Bilemedim');
    expect(
      await screen.findByText(
        'Bu kart başka bir sekmede ya da cihazda zaten değerlendirildi. Güncel kartı gösteriyoruz.',
      ),
    ).toBeDefined();
    await waitFor(() => expect(within(frontText()).getByText('resilient')).toBeDefined());
    expect(sessions['s-a']!.cards[0]!.outcome).toBe('known');
    expect(progressText()).toBe('Tamamlanan 1 / 3');

    // A stale version for the new current card (the other tab moved on again).
    serverAct(sessions['s-a']!, { cardId: 's-a-card-1', version: 1, action: 'skip' });
    press('Bildim');
    expect(
      await screen.findByText(
        'Bu çalışma başka bir sekmede ya da cihazda güncellendi. Güncel kartı gösteriyoruz.',
      ),
    ).toBeDefined();
    await waitFor(() => expect(within(frontText()).getByText('take into account')).toBeDefined());
    expect(sessions['s-a']!.cards[1]!.outcome).toBeNull();
  });

  it('opens the result when the session was ended early on another device', async () => {
    const router = await openActive();
    sessions['s-a']!.status = 'ended_early';
    sessions['s-a']!.finishedAt = '2026-10-22T09:30:00Z';
    sessions['s-a']!.version += 1;
    press('Bilemedim');
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/kelime/study/sessions/s-a/summary'),
    );
    expect(await screen.findByRole('heading', { level: 1, name: 'Çalışmayı erken bitirdin' }));
    expect(sessions['s-a']!.cards.every((card) => card.outcome === null)).toBe(true);
  });

  it('opens the result when the session was finished on another device', async () => {
    const router = await openActive();
    for (const [index, action] of (['known', 'missed', 'known'] as const).entries())
      serverAct(sessions['s-a']!, { cardId: `s-a-card-${index}`, version: index, action });
    press('Bildim');
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/kelime/study/sessions/s-a/summary'),
    );
    expect(await screen.findByRole('heading', { level: 1, name: 'Çalışmayı tamamladın' }));
  });
});

describe('resume and navigation', () => {
  it('restores the server state after leaving and returning, with the same order and no reshuffle', async () => {
    const router = await openActive();
    press('Atla');
    await waitFor(() => expect(within(frontText()).getByText('resilient')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Cevabı göster' }));

    fireEvent.click(screen.getByRole('link', { name: 'Listeye dön' }));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/kelime/lists/${L1}`));
    await screen.findByRole('heading', { level: 1, name: 'Algorithms' });
    expect(router.state.location.pathname).toBe(`/kelime/lists/${L1}`);
    // Leaving never ends the session.
    expect(posts('/end')).toHaveLength(0);
    const resume = await screen.findByRole('link', { name: 'Çalışmaya devam et' });
    expect(resume.getAttribute('href')).toBe('/kelime/study/sessions/s-a');

    const reads = () => calls.filter((call) => call.url === '/api/study-sessions/s-a').length;
    const before = reads();
    fireEvent.click(resume);
    await screen.findByRole('group', { name: 'Kartı değerlendir' });
    await waitFor(() => expect(reads()).toBe(before + 1));
    expect(within(frontText()).getByText('resilient')).toBeDefined();
    expect(screen.queryByText('dayanıklı')).toBeNull();
    expect(screen.getByText('Atladığın 1 kart, diğer kartlardan sonra bir kez daha gelecek.'));
    expect(
      calls.filter((call) => call.method === 'POST' && !call.url.endsWith('/actions')),
    ).toEqual([]);
  });

  it('a fresh page load (reload or another device) shows the persisted queue position', async () => {
    const session = makeSession('s-r', L1);
    serverAct(session, { cardId: 's-r-card-0', version: 0, action: 'skip' });
    serverAct(session, { cardId: 's-r-card-1', version: 1, action: 'known' });
    serverAct(session, { cardId: 's-r-card-2', version: 2, action: 'known' });
    await openActive(session);
    expect(within(frontText()).getByText('run')).toBeDefined();
    expect(actionLabels()).toEqual(['Bildim', 'Çıkar', 'Bilemedim']);
    expect(progressText()).toBe('Tamamlanan 2 / 3');
  });

  it('shows the list detail entry points for starting or resuming', async () => {
    await open(`/lists/${L1}`);
    expect(
      (await screen.findByRole('link', { name: 'Çalışmaya başla' })).getAttribute('href'),
    ).toBe(`/kelime/lists/${L1}/study`);
    expect(screen.getByRole('button', { name: 'Kelime ekle' })).toBeDefined();
  });

  it('lists the student lists on the Kelime Çalış page', async () => {
    await open('/study');
    const link = await screen.findByRole('link', { name: /Algorithms.*Kelime kartlarıyla çalış/ });
    expect(link.getAttribute('href')).toBe(`/kelime/lists/${L1}/study`);
    expect(screen.getByRole('link', { name: /Boş liste.*Henüz kelime yok/ }).textContent).toMatch(
      /Henüz kelime yok/,
    );
  });

  it('reports an unavailable session (unknown or another student)', async () => {
    await open('/study/sessions/s-missing');
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Bu çalışmaya ulaşılamıyor. Listelerine dönüp tekrar dene.',
    );
    expect(screen.queryByRole('group', { name: 'Kartı değerlendir' })).toBeNull();
  });

  it('sends the summary route of an active session back to the session', async () => {
    sessions['s-a'] = makeSession('s-a', L1);
    const router = await open('/study/sessions/s-a/summary');
    await screen.findByRole('group', { name: 'Kartı değerlendir' });
    expect(router.state.location.pathname).toBe('/kelime/study/sessions/s-a');
  });
});

describe('results', () => {
  it('summarizes a completed session with per-word outcomes from the snapshots', async () => {
    const session = makeSession('s-done', L1, { percentage: 25 });
    serverAct(session, { cardId: 's-done-card-0', version: 0, action: 'skip' });
    serverAct(session, { cardId: 's-done-card-1', version: 1, action: 'missed' });
    serverAct(session, { cardId: 's-done-card-2', version: 2, action: 'known' });
    serverAct(session, { cardId: 's-done-card-0', version: 3, action: 'remove' });
    sessions[session.id] = session;
    await open('/study/sessions/s-done/summary');

    expect(await screen.findByRole('heading', { level: 1, name: 'Çalışmayı tamamladın' }));
    expect(screen.getByText('İngilizce → Türkçe')).toBeDefined();
    expect(screen.getByText('%25 · 3 kart')).toBeDefined();
    const counts = within(screen.getByRole('list', { name: 'Sonuç sayıları' }));
    expect(counts.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Bildim1',
      'Bilemedim1',
      'Çıkarılan1',
    ]);
    // No unanswered group for a completed session.
    expect(screen.queryByRole('button', { name: /Cevaplanmayan/ })).toBeNull();

    const words = () => within(screen.getByRole('list', { name: /kartları$/ }));
    expect(words().getByRole('heading', { name: 'take into account' })).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: /^Çıkarılan/ }));
    expect(screen.getByRole('button', { name: /^Çıkarılan/ }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(words().getByRole('heading', { name: 'run' })).toBeDefined();
    expect(
      within(words().getByRole('list', { name: 'run Türkçe anlamları' }))
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['koşmak', 'çalıştırmak', 'yönetmek']);
    fireEvent.click(screen.getByRole('button', { name: /^Bilemedim/ }));
    expect(words().getByRole('heading', { name: 'resilient' })).toBeDefined();

    expect(screen.getByRole('link', { name: 'Yeni çalışma başlat' }).getAttribute('href')).toBe(
      `/kelime/lists/${L1}/study`,
    );
    expect(screen.getByRole('link', { name: 'Listeye dön' }).getAttribute('href')).toBe(
      `/kelime/lists/${L1}`,
    );
  });

  it('ends early from the card screen, keeping answers and listing unanswered cards separately', async () => {
    const router = await openActive();
    press('Bilemedim');
    await waitFor(() => expect(progressText()).toBe('Tamamlanan 1 / 3'));
    press('Atla');
    await waitFor(() => expect(within(frontText()).getByText('take into account')).toBeDefined());

    const trigger = screen.getByRole('button', { name: 'Çalışmayı bitir' });
    fireEvent.click(trigger);
    const dialog = await screen.findByRole('dialog');
    // Keeping on studying closes the dialog without ending anything.
    fireEvent.click(within(dialog).getByRole('button', { name: 'Çalışmaya devam et' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(posts('/end')).toHaveLength(0);
    expect(document.activeElement).toBe(trigger);

    fireEvent.click(trigger);
    fireEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Çalışmayı bitir' }),
    );
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/kelime/study/sessions/s-a/summary'),
    );
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Çalışmayı erken bitirdin' }),
    ).toBeDefined();
    const counts = within(screen.getByRole('list', { name: 'Sonuç sayıları' }));
    expect(counts.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Bildim0',
      'Bilemedim1',
      'Çıkarılan0',
      'Cevaplanmayan2',
    ]);
    expect(screen.getByText(/2 kart değerlendirilmedi\. Bu kartlar "Bilemedim" sayılmaz/));
    // The default group is the first non-empty one; "Bildim" is empty here.
    expect(screen.getByRole('button', { name: /^Bilemedim/ }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    fireEvent.click(screen.getByRole('button', { name: /^Bildim/ }));
    expect(screen.getByText('Bu çalışmada "Bildim" dediğin kart yok.')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: /^Cevaplanmayan/ }));
    const unanswered = within(screen.getByRole('list', { name: 'Cevaplanmayan kartları' }));
    expect(unanswered.getAllByRole('heading').map((heading) => heading.textContent)).toEqual([
      'resilient',
      'take into account',
    ]);
    expect(sessions['s-a']!.cards.map((card) => card.outcome)).toEqual(['missed', null, null]);
  });
});
