import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { entryCells, isPuzzleSession, type PuzzleSession } from '../../lib/puzzles';
import { isActivity } from '../../lib/activity';
import { PuzzleSessionPage, PuzzleSetupPage } from './PuzzlePage';
import { WordSearchBoard } from './WordSearchBoard';
import { CrosswordBoard } from './CrosswordBoard';
import { GamesHubPage } from './GamesHubPage';

const time = '2026-10-24T12:00:00Z';
const wordId = '10000000-0000-4000-8000-000000000001';
const search: PuzzleSession = {
  id: 'session',
  listId: 'list',
  listTitle: 'Algorithms',
  gameType: 'word-search',
  percentage: 100,
  eligibleCount: 1,
  selectedCount: 1,
  placedCount: 1,
  version: 0,
  status: 'ACTIVE',
  createdAt: time,
  completedAt: null,
  canceledAt: null,
  omitted: [],
  unplaced: [],
  boards: [
    {
      rows: 3,
      cols: 3,
      grid: [...'CATXXXXXX'],
      draft: Array<string>(9).fill(''),
      entries: [
        {
          id: wordId,
          meanings: ['kedi', 'kedigillerden hayvan'],
          length: 3,
          segments: [3],
          number: 0,
          solved: false,
          attempts: 0,
        },
      ],
    },
  ],
};
const crossing: PuzzleSession = {
  ...search,
  gameType: 'crossword',
  eligibleCount: 3,
  selectedCount: 3,
  placedCount: 3,
  boards: [
    {
      rows: 3,
      cols: 4,
      grid: ['', '', '', null, null, '', null, null, null, '', '', ''],
      draft: Array<string>(12).fill(''),
      entries: [
        {
          id: wordId,
          meanings: ['kedi', 'kedigillerden hayvan'],
          length: 3,
          segments: [3],
          number: 1,
          row: 0,
          col: 0,
          dr: 0,
          dc: 1,
          solved: false,
          attempts: 0,
        },
        {
          id: '10000000-0000-4000-8000-000000000002',
          meanings: ['sanat'],
          length: 3,
          segments: [3],
          number: 2,
          row: 0,
          col: 1,
          dr: 1,
          dc: 0,
          solved: false,
          attempts: 0,
        },
        {
          id: '10000000-0000-4000-8000-000000000003',
          meanings: ['çay'],
          length: 3,
          segments: [3],
          number: 3,
          row: 2,
          col: 1,
          dr: 0,
          dc: 1,
          solved: false,
          attempts: 0,
        },
      ],
    },
  ],
};
const answers = ['CAT', 'ART', 'TEA'];
let current: PuzzleSession,
  active: PuzzleSession | null,
  client: QueryClient,
  failMove: boolean,
  failStart: boolean;
const calls: { url: string; body: Record<string, unknown> }[] = [];
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
beforeEach(() => {
  current = structuredClone(search);
  active = null;
  failMove = false;
  failStart = false;
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
            { id: 'list', title: 'Algorithms', wordCount: 1, createdAt: time, updatedAt: time },
          ],
        });
      if (url.startsWith('/api/puzzles/active?'))
        return json({
          sessions: active
            ? [{ id: active.id, listTitle: active.listTitle, placedCount: active.placedCount }]
            : [],
        });
      if (url.includes('/lists/list/puzzles?'))
        return json({ eligibleCount: 20, omitted: [], session: active });
      if (url === '/api/lists/list/puzzles') {
        if (failStart) return json({ error: { code: 'CROSSWORD_UNAVAILABLE' } }, 409);
        active = current;
        return json({ session: current }, 201);
      }
      if (url.endsWith('/moves')) {
        if (failMove) throw new TypeError('offline');
        const board = current.boards[Number(body['board'])]!;
        let correct: boolean | null = null;
        if (body['action'] === 'draft')
          board.draft = (body['values'] as string[]).map((v) => v.toUpperCase());
        if (body['action'] === 'check') {
          const e = board.entries.find((e) => e.id === body['entryId'])!;
          const i = board.entries.indexOf(e);
          correct =
            entryCells(e, board.cols)
              .map((c) => board.draft[c])
              .join('') === answers[i];
          e.attempts++;
          e.solved = correct;
          if (correct) e.english = answers[i]!.toLowerCase();
        }
        if (body['action'] === 'select') {
          correct =
            (body['start'] === 0 && body['end'] === 2) ||
            (body['start'] === 2 && body['end'] === 0);
          if (correct)
            Object.assign(board.entries[0]!, {
              solved: true,
              attempts: 1,
              english: 'cat',
              row: 0,
              col: 0,
              dr: 0,
              dc: 1,
            });
        }
        current.version++;
        return json({ session: current, correct, applied: true });
      }
      if (url.endsWith('/cancel')) {
        current.status = 'CANCELED';
        current.version++;
        active = null;
        return json({ session: current, applied: true });
      }
      if (url.endsWith('/complete')) {
        current.status = 'COMPLETED';
        current.version++;
        return json({ session: current, applied: true });
      }
      if (url === '/api/puzzles/session') return json({ session: current });
      throw new Error(`Unexpected mocked request: ${url}`);
    }),
  );
});
afterEach(() => {
  client.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
function wrapper(child: React.ReactNode, path = '/') {
  return (
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>{child}</MemoryRouter>
    </QueryClientProvider>
  );
}
function play() {
  return render(
    wrapper(
      <Routes>
        <Route path="/games/puzzles/:sessionId" element={<PuzzleSessionPage />} />
      </Routes>,
      '/games/puzzles/session',
    ),
  );
}
function cell(index: number) {
  return document.querySelector<HTMLInputElement | HTMLButtonElement>(`[data-cell="${index}"]`)!;
}
function pointer(target: Element, type: string, id = 1, pointerType = 'touch') {
  const event = new MouseEvent(type, { bubbles: true, button: 0 });
  Object.defineProperties(event, {
    pointerId: { value: id },
    isPrimary: { value: true },
    pointerType: { value: pointerType },
  });
  fireEvent(target, event);
}
describe('Word Search accessible interactions', () => {
  it('shows all Turkish meanings without an English solution list', () => {
    render(<WordSearchBoard board={search.boards[0]!} busy={false} select={vi.fn()} />);
    expect(screen.getByText(/kedi \/ kedigillerden hayvan/)).toBeTruthy();
    expect(screen.queryByText(/^cat$/i)).toBeNull();
    expect(
      screen.getByRole('group', { name: 'Kelime Avı harfleri' }).getAttribute('aria-describedby'),
    ).toBe('search-help');
  });
  it('selects two endpoints with native keyboard activation and arrow navigation', () => {
    const select = vi.fn();
    render(<WordSearchBoard board={search.boards[0]!} busy={false} select={select} />);
    cell(0).focus();
    fireEvent.click(cell(0), { detail: 0 });
    fireEvent.keyDown(cell(0), { key: 'ArrowRight' });
    expect(document.activeElement).toBe(cell(1));
    fireEvent.keyDown(cell(1), { key: 'ArrowRight' });
    expect(document.activeElement).toBe(cell(2));
    fireEvent.click(cell(2), { detail: 0 });
    expect(select).toHaveBeenCalledWith(0, 2);
    fireEvent.click(cell(0), { detail: 0 });
    fireEvent.keyDown(cell(0), { key: 'Escape' });
    expect(screen.getByText('Başlangıç harfini seç.')).toBeTruthy();
  });
  it.each(['mouse', 'touch'])('supports %s drag and exact endpoints', (type) => {
    const select = vi.fn();
    render(<WordSearchBoard board={search.boards[0]!} busy={false} select={select} />);
    pointer(cell(0), 'pointerdown', 3, type);
    pointer(cell(2), 'pointermove', 3, type);
    pointer(cell(2), 'pointerup', 3, type);
    expect(select).toHaveBeenCalledWith(0, 2);
  });
  it('supports two taps and pointer cancellation without an accidental submission', () => {
    const select = vi.fn();
    const view = render(<WordSearchBoard board={search.boards[0]!} busy={false} select={select} />);
    pointer(cell(0), 'pointerdown');
    pointer(cell(0), 'pointerup');
    expect(select).not.toHaveBeenCalled();
    pointer(cell(2), 'pointerdown');
    pointer(cell(2), 'pointerup');
    expect(select).toHaveBeenCalledWith(0, 2);
    select.mockClear();
    pointer(cell(0), 'pointerdown');
    pointer(cell(1), 'pointercancel');
    pointer(cell(2), 'pointerup');
    expect(select).not.toHaveBeenCalled();
    view.rerender(
      <WordSearchBoard
        board={{ ...search.boards[0]!, cols: 9, grid: Array<string>(27).fill('A') }}
        busy={false}
        select={select}
      />,
    );
    const viewport = screen.getByRole('region', { name: /Harf tahtası/ });
    Object.defineProperties(viewport, { scrollWidth: { value: 600 }, clientWidth: { value: 280 } });
    const scroll = vi.fn(({ left }: ScrollToOptions) => {
      viewport.scrollLeft += left ?? 0;
      fireEvent.scroll(viewport);
    });
    Object.defineProperty(viewport, 'scrollBy', { value: scroll });
    fireEvent.resize(window);
    pointer(cell(0), 'pointerdown');
    pointer(cell(0), 'pointerup');
    fireEvent.click(screen.getByRole('button', { name: 'Tahtayı sağa kaydır' }));
    expect(scroll).toHaveBeenCalledWith({ left: 240, behavior: 'auto' });
    pointer(cell(2), 'pointerdown');
    pointer(cell(2), 'pointerup');
    expect(select).toHaveBeenCalledWith(0, 2);
  });
  it('marks found cells and clues with text as well as styling', () => {
    const board = structuredClone(search.boards[0]!);
    Object.assign(board.entries[0]!, {
      solved: true,
      english: 'cat',
      row: 0,
      col: 0,
      dr: 0,
      dc: 1,
    });
    render(<WordSearchBoard board={board} busy={false} select={vi.fn()} />);
    expect(screen.getByText(/✓ Bulundu:/)).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /bulundu/ })).toHaveLength(3);
  });
  it('reports the last selection in the board status line, which a new selection replaces', () => {
    const board = search.boards[0]!;
    const view = render(
      <WordSearchBoard board={board} busy={false} select={vi.fn()} result={{ correct: true }} />,
    );
    const status = screen.getByRole('status');
    expect(status.textContent).toMatch(/Kelime bulundu/);
    fireEvent.click(cell(0), { detail: 0 });
    expect(status.textContent).toMatch(/Başlangıç: satır 1, sütun 1/);
    fireEvent.keyDown(cell(0), { key: 'Escape' });
    view.rerender(
      <WordSearchBoard board={board} busy={false} select={vi.fn()} result={{ correct: false }} />,
    );
    expect(status.textContent).toMatch(/Bu seçim eşleşmedi/);
  });
  it('keeps focus available but prevents submissions while a request is pending', () => {
    const select = vi.fn();
    render(<WordSearchBoard board={search.boards[0]!} busy select={select} />);
    fireEvent.click(cell(0), { detail: 0 });
    fireEvent.click(cell(2), { detail: 0 });
    expect(select).not.toHaveBeenCalled();
    expect(cell(0).getAttribute('aria-disabled')).toBe('true');
  });
});
describe('persistent game pages and transport', () => {
  it('does not carry a Word Search verdict onto another board', async () => {
    current.boards.push(structuredClone(current.boards[0]!));
    current.boards[1]!.entries[0]!.id = '10000000-0000-4000-8000-000000000002';
    current.selectedCount = current.placedCount = current.eligibleCount = 2;
    play();
    await screen.findByRole('group', { name: 'Kelime Avı harfleri' });
    fireEvent.click(cell(0), { detail: 0 });
    fireEvent.click(cell(2), { detail: 0 });
    await screen.findByText('Kelime bulundu. Sıradakini ara.');
    fireEvent.click(screen.getByRole('combobox', { name: 'Tahta' }));
    fireEvent.click(screen.getByRole('option', { name: /2\/2/ }));
    expect(screen.queryByText('Kelime bulundu. Sıradakini ara.')).toBeNull();
    expect(screen.getByText('Başlangıç harfini seç.')).toBeDefined();
  });

  it('discovers active sessions without selecting a surviving source list', async () => {
    active = { ...structuredClone(search), listId: null, listTitle: 'Deleted source fixture' };
    render(wrapper(<PuzzleSetupPage type="word-search" />));
    expect(
      (await screen.findByRole('link', { name: /Deleted source fixture/ })).getAttribute('href'),
    ).toBe('/games/puzzles/session');
  });
  it('offers both games beside the four original games', () => {
    render(wrapper(<GamesHubPage />));
    for (const name of [
      'Klasik test',
      'Eşleştirme',
      'Kelime Oluşturma',
      'Hafıza Oyunu',
      'Kelime Avı',
      'Çapraz Bulmaca',
    ])
      expect(screen.getByRole('link', { name })).toBeTruthy();
  });
  it('loads only eligibility, applies the existing percentage choices and starts on the server', async () => {
    render(
      wrapper(
        <Routes>
          <Route path="/games/word-search" element={<PuzzleSetupPage type="word-search" />} />
          <Route path="/games/puzzles/:sessionId" element={<PuzzleSessionPage />} />
        </Routes>,
        '/games/word-search?list=list',
      ),
    );
    await screen.findByRole('button', { name: 'Oyuna başla' });
    for (const percent of [15, 25, 50, 100])
      expect(screen.getByRole('radio', { name: new RegExp(`%${percent} ·`) })).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: /%50 · 10 kelime/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Oyuna başla' }));
    await screen.findByRole('group', { name: 'Kelime Avı harfleri' });
    expect(calls.find((c) => c.url === '/api/lists/list/puzzles')?.body).toEqual({
      gameType: 'word-search',
      percentage: 50,
    });
    expect(calls.some((c) => c.url.includes('/words'))).toBe(false);
  });
  it('offers resume and confirmed cancellation, including dialog focus restoration', async () => {
    active = structuredClone(search);
    render(wrapper(<PuzzleSetupPage type="word-search" />, '/?list=list'));
    await screen.findByRole('link', { name: 'Devam Et' });
    const trigger = screen.getByRole('button', { name: 'İptal Et' });
    fireEvent.click(trigger);
    const dialog = await screen.findByRole('dialog');
    expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Devam Et' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Devam Et' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.activeElement).toBe(trigger);
    fireEvent.click(trigger);
    fireEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'İptali onayla' }),
    );
    await screen.findByRole('button', { name: 'Oyuna başla' });
    expect(calls.filter((c) => c.url.endsWith('/cancel'))).toHaveLength(1);
  });
  it('shows an honest generation failure and actions without fabricated success', async () => {
    failStart = true;
    render(wrapper(<PuzzleSetupPage type="crossword" />, '/?list=list'));
    fireEvent.click(await screen.findByRole('button', { name: 'Oyuna başla' }));
    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      expect.stringContaining('en az 3 kelimeli'),
    );
    expect(screen.queryByText('Oyun tamamlandı')).toBeNull();
  });
  it('sends coordinates and version, reveals found spelling and saves completion separately', async () => {
    play();
    await screen.findByRole('group', { name: 'Kelime Avı harfleri' });
    fireEvent.click(cell(0), { detail: 0 });
    fireEvent.click(cell(2), { detail: 0 });
    await screen.findByText('1/1 kelime bulundu');
    expect(screen.getByText('cat')).toBeTruthy();
    const move = calls.find((c) => c.url.endsWith('/moves'))!.body;
    expect(move).toMatchObject({ action: 'select', board: 0, start: 0, end: 2, version: 0 });
    expect(move).not.toHaveProperty('solvedIds');
    fireEvent.click(screen.getByRole('button', { name: 'Oyunu tamamla' }));
    await screen.findByRole('heading', { name: 'Oyun tamamlandı' });
    expect(calls.find((c) => c.url.endsWith('/complete'))!.body).toEqual({});
  });
  it('resumes the server layout after remount and leaves incomplete games out of history', async () => {
    const view = play();
    await screen.findByRole('group', { name: 'Kelime Avı harfleri' });
    view.unmount();
    play();
    await screen.findByText('0/1 kelime bulundu');
    expect(calls.filter((c) => c.url === '/api/puzzles/session')).toHaveLength(2);
    expect(calls.some((c) => c.url.endsWith('/complete'))).toBe(false);
  });
  it('retries the identical failed command and preserves its request identity', async () => {
    failMove = true;
    play();
    await screen.findByRole('group', { name: 'Kelime Avı harfleri' });
    fireEvent.click(cell(0), { detail: 0 });
    fireEvent.click(cell(2), { detail: 0 });
    const retry = await screen.findByRole('button', { name: 'Aynı isteği tekrar dene' });
    failMove = false;
    fireEvent.click(retry);
    await screen.findByText('1/1 kelime bulundu');
    const moves = calls.filter((c) => c.url.endsWith('/moves'));
    expect(moves).toHaveLength(2);
    expect(moves[0]!.body).toEqual(moves[1]!.body);
  });
});
describe('Crossword accessible entry and durable drafts', () => {
  it('locks edits after an unacknowledged draft until the identical command is recovered', async () => {
    current = structuredClone(crossing);
    failMove = true;
    play();
    await screen.findByRole('group', { name: 'Çapraz Bulmaca hücreleri' });
    fireEvent.change(cell(0), { target: { value: 'c' } });
    const retry = await screen.findByRole('button', { name: 'Aynı isteği tekrar dene' });
    expect((cell(0) as HTMLInputElement).readOnly).toBe(true);
    const first = calls.find((c) => c.body['action'] === 'draft')!.body;
    failMove = false;
    fireEvent.click(retry);
    await waitFor(() => expect((cell(0) as HTMLInputElement).readOnly).toBe(false));
    expect((cell(0) as HTMLInputElement).value).toBe('C');
    expect(calls.filter((c) => c.body['action'] === 'draft').at(-1)!.body).toEqual(first);
    fireEvent.change(cell(0), { target: { value: 'b' } });
    await waitFor(() => expect(current.boards[0]!.draft[0]).toBe('B'));
  });

  it('recovers from a stale draft revision and automatically saves subsequent edits', async () => {
    current = structuredClone(crossing);
    const implementation = vi.mocked(fetch).getMockImplementation()!;
    let stale = true;
    vi.mocked(fetch).mockImplementation(async (...args) => {
      if (stale && typeof args[0] === 'string' && args[0].endsWith('/moves')) {
        stale = false;
        current.version++;
        current.boards[0]!.draft[0] = 'A';
        return json({ error: { code: 'PUZZLE_CONFLICT' } }, 409);
      }
      return implementation(...args);
    });
    play();
    await screen.findByRole('group', { name: 'Çapraz Bulmaca hücreleri' });
    fireEvent.change(cell(0), { target: { value: 'c' } });
    await waitFor(() => expect((cell(0) as HTMLInputElement).value).toBe('A'));
    fireEvent.change(cell(0), { target: { value: 'b' } });
    await waitFor(() => expect(current.boards[0]!.draft[0]).toBe('B'));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });
  async function mount() {
    current = structuredClone(crossing);
    play();
    await screen.findByRole('group', { name: 'Çapraz Bulmaca hücreleri' });
  }
  it.each([false, true])(
    'keeps a verdict attached to the checked clue (delayed response: %s)',
    async (delayed) => {
      let release: (() => void) | undefined;
      if (delayed) {
        const implementation = vi.mocked(fetch).getMockImplementation()!;
        vi.mocked(fetch).mockImplementation(async (...args) => {
          const response = await implementation(...args);
          if (typeof args[0] === 'string' && args[0].endsWith('/moves'))
            await new Promise<void>((resolve) => {
              release = resolve;
            });
          return response;
        });
      }
      await mount();
      fireEvent.click(screen.getByRole('button', { name: 'Kelimeyi kontrol et' }));
      if (delayed) await waitFor(() => expect(release).toBeDefined());
      else await screen.findByText(/Henüz doğru değil/);
      fireEvent.click(screen.getByRole('button', { name: /2. sanat/ }));
      if (release) {
        release();
        await waitFor(() => expect(screen.getByText('Taslağın kaydedildi.')).toBeDefined());
      }
      expect(screen.getByText(/Etkin ipucu: 2 Dikey/)).toBeDefined();
      expect(screen.queryByText(/Henüz doğru değil/)).toBeNull();
      // Returning to the checked clue can still show its own last result.
      fireEvent.click(screen.getByRole('button', { name: /1. kedi/ }));
      expect(await screen.findByText(/Henüz doğru değil/)).toBeDefined();
    },
  );

  it('associates numbered across/down clues without exposing unsolved answers', async () => {
    await mount();
    expect(screen.getByRole('heading', { name: 'Yatay' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Dikey' })).toBeTruthy();
    for (const answer of answers)
      expect(document.body.textContent?.toLowerCase()).not.toContain(answer.toLowerCase());
    expect(cell(0).getAttribute('aria-describedby')).toBe(`clue-${wordId}`);
    expect(cell(0).getAttribute('spellcheck')).toBe('false');
    expect(cell(0).getAttribute('autocomplete')).toBe('off');
    expect(document.querySelectorAll('input[data-cell]')).toHaveLength(7);
  });
  it('navigates arrows, highlights the active entry and selects a numbered clue', async () => {
    await mount();
    fireEvent.click(screen.getByRole('button', { name: /2. sanat/ }));
    expect(screen.getByText(/Etkin ipucu: 2 Dikey/)).toBeTruthy();
    expect(document.activeElement).toBe(cell(1));
    fireEvent.keyDown(cell(1), { key: 'ArrowDown' });
    expect(document.activeElement).toBe(cell(5));
    fireEvent.keyDown(cell(5), { key: 'ArrowDown' });
    expect(document.activeElement).toBe(cell(9));
    fireEvent.keyDown(cell(9), { key: 'ArrowRight' });
    expect(document.activeElement).toBe(cell(10));
    expect(screen.getByText(/Etkin ipucu: 3 Yatay/)).toBeTruthy();
  });
  it('normalizes ASCII input, saves automatically, checks wrong answers and permits correction', async () => {
    await mount();
    fireEvent.change(cell(0), { target: { value: 'x' } });
    fireEvent.change(cell(1), { target: { value: 'a' } });
    fireEvent.change(cell(2), { target: { value: 't' } });
    expect((cell(0) as HTMLInputElement).value).toBe('X');
    await waitFor(() => expect(calls.some((c) => c.body['action'] === 'draft')).toBe(true));
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Kelimeyi kontrol et' }).hasAttribute('disabled'),
      ).toBe(false),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Kelimeyi kontrol et' }));
    await screen.findByText(/Henüz doğru değil/);
    expect(screen.queryByText(/^cat$/i)).toBeNull();
    fireEvent.change(cell(0), { target: { value: 'c' } });
    await waitFor(() => expect(calls.filter((c) => c.body['action'] === 'draft')).toHaveLength(2));
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Kelimeyi kontrol et' }).hasAttribute('disabled'),
      ).toBe(false),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Kelimeyi kontrol et' }));
    await screen.findByText(/Doğru. Kelime tamamlandı/);
    expect(screen.getByText('cat')).toBeTruthy();
    expect(cell(0).hasAttribute('readonly')).toBe(true);
  });
  it('handles Backspace in an empty cell and rejects unsupported letter input', async () => {
    await mount();
    fireEvent.change(cell(0), { target: { value: 'c' } });
    fireEvent.change(cell(1), { target: { value: 'ç' } });
    expect((cell(1) as HTMLInputElement).value).toBe('');
    fireEvent.keyDown(cell(1), { key: 'Backspace' });
    expect((cell(0) as HTMLInputElement).value).toBe('');
    expect(document.activeElement).toBe(cell(0));
  });
  it('reloads drafts entered on another device from authoritative state', () => {
    current = structuredClone(crossing);
    current.boards[0]!.draft[0] = 'C';
    render(wrapper(<CrosswordBoard session={current} boardIndex={0} />));
    expect((cell(0) as HTMLInputElement).value).toBe('C');
  });
});
describe('response/history contracts', () => {
  it('accepts both valid game views and rejects malformed grids and hidden answers', () => {
    expect(isPuzzleSession(search)).toBe(true);
    expect(isPuzzleSession(crossing)).toBe(true);
    const broken = structuredClone(search);
    broken.boards[0]!.grid.pop();
    expect(isPuzzleSession(broken)).toBe(false);
    const leaked = structuredClone(crossing);
    leaked.boards[0]!.entries[0]!.english = 'cat';
    expect(isPuzzleSession(leaked)).toBe(false);
  });
  it.each(['word-search', 'crossword'])(
    'accepts large authoritative %s history and preserves the old game limit',
    (gameType) => {
      const activity = {
        kind: 'game',
        key: 'game:x',
        at: time,
        game: {
          id: 'game',
          wordListId: null,
          listTitle: 'List',
          gameType,
          items: Array.from({ length: 20 }, () => ({
            wordId: null,
            english: 'cat',
            meanings: ['kedi'],
            outcome: 'correct',
            attempts: 1,
          })),
        },
      };
      expect(isActivity(activity)).toBe(true);
      expect(isActivity({ ...activity, game: { ...activity.game, gameType: 'quiz' } })).toBe(false);
    },
  );
});
