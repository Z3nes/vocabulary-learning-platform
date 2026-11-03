import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Completion, GameItem, Snapshot } from '../../lib/games';
import { GameFrame, Unsuitable } from './GameFrame';
const list = {
  id: 'list',
  title: 'Test list',
  wordCount: 1,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};
const original = {
  id: 'word',
  english: 'apple',
  meanings: [{ id: 'meaning', turkish: 'elma', position: 0 }],
};
const json = (body: object) =>
  new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
function Play({ words, done }: { words: Snapshot[]; done: (items: GameItem[]) => void }) {
  return (
    <>
      <h2>{words[0]?.english}</h2>
      <button
        onClick={() => done(words.map((word) => ({ ...word, outcome: 'correct', attempts: 1 })))}
      >
        Bitir
      </button>
    </>
  );
}
function fixture(failFirst = false, Game: typeof Play = Play, path = '/games/quiz?list=list') {
  let currentWord = original;
  const bodies: Completion[] = [];
  const fetchMock = vi.fn((url: string, options?: RequestInit) => {
    if (url.endsWith('/games/completions')) {
      if (typeof options?.body !== 'string') throw new Error('Expected a JSON request body');
      bodies.push(JSON.parse(options.body) as Completion);
      if (failFirst && bodies.length === 1) return Promise.reject(new TypeError('Network failure'));
      return Promise.resolve(json({ game: { id: 'saved' }, applied: bodies.length === 1 }));
    }
    return Promise.resolve(
      json(url.endsWith('/words') ? { words: [currentWord] } : { lists: [list] }),
    );
  });
  vi.stubGlobal('fetch', fetchMock);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const view = render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <GameFrame type="quiz" Play={Game} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return {
    ...view,
    bodies,
    client,
    fetchMock,
    change: () => {
      currentWord = { ...original, english: 'changed in another tab' };
    },
  };
}
afterEach(() => vi.unstubAllGlobals());
describe('client-only game lifecycle', () => {
  it('selects a list from the shared menu before loading words or starting the round', async () => {
    const f = fixture(false, Play, '/games/quiz');
    const select = await screen.findByRole('combobox', { name: 'Kelime listesi' });
    expect(select.textContent).toBe('Liste seç');
    expect(f.fetchMock.mock.calls.some((call) => call[0].endsWith('/words'))).toBe(false);
    fireEvent.keyDown(select, { key: 'End' });
    expect(screen.queryByRole('button', { name: 'Oyuna başla' })).toBeNull();
    fireEvent.keyDown(select, { key: 'Enter' });
    const start = await screen.findByRole('button', { name: 'Oyuna başla' });
    expect(f.fetchMock.mock.calls.some((call) => call[0].endsWith('/lists/list/words'))).toBe(true);
    expect(f.bodies).toHaveLength(0);
    fireEvent.click(start);
    expect(screen.getByRole('heading', { name: 'apple' })).toBeTruthy();
  });
  it('loads complete vocabulary, freezes displayed text, and persists only at completion', async () => {
    const f = fixture();
    fireEvent.click(await screen.findByRole('button', { name: 'Oyuna başla' }));
    f.change();
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('apple');
    expect(f.bodies).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Bitir' }));
    await screen.findByText(/Sonucun kaydedildi/);
    expect(f.bodies[0]?.items[0]).toMatchObject({ english: 'apple', meanings: ['elma'] });
    expect(f.fetchMock.mock.calls.filter((call) => call[0].endsWith('/words'))).toHaveLength(1);
  });
  it('retries the original completion UUID and unchanged payload after a lost response', async () => {
    const f = fixture(true);
    fireEvent.click(await screen.findByRole('button', { name: 'Oyuna başla' }));
    fireEvent.click(screen.getByRole('button', { name: 'Bitir' }));
    await screen.findByRole('alert');
    expect(screen.queryByText(/Sonucun kaydedildi/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Tekrar dene' }));
    await screen.findByText(/Sonucun kaydedildi/);
    expect(f.bodies).toHaveLength(2);
    expect(f.bodies[1]).toEqual(f.bodies[0]);
  });
  it('leaves an unfinished game without writing history', async () => {
    const f = fixture();
    fireEvent.click(await screen.findByRole('button', { name: 'Oyuna başla' }));
    f.unmount();
    await waitFor(() => expect(f.bodies).toHaveLength(0));
  });
  it('provides a recovery path if the list was deleted before loading', async () => {
    const f = fixture();
    f.unmount();
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({ error: { code: 'LIST_NOT_FOUND' } }), {
            status: 404,
            headers: { 'content-type': 'application/json' },
          }),
        ),
      ),
    );
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <MemoryRouter initialEntries={['/games/quiz?list=deleted']}>
          <GameFrame type="quiz" Play={Play} />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(await screen.findByRole('alert')).toBeDefined();
    expect(screen.getByRole('link', { name: 'Listene dön' }).getAttribute('href')).toBe(
      '/lists/deleted',
    );
  });
  it('starts a new round with a new completion only after the result is saved', async () => {
    const f = fixture();
    fireEvent.click(await screen.findByRole('button', { name: 'Oyuna başla' }));
    expect(screen.queryByRole('button', { name: 'Yeni tur başlat' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Bitir' }));
    await screen.findByText(/Sonucun kaydedildi/);
    fireEvent.click(screen.getByRole('button', { name: 'Yeni tur başlat' }));
    // Back at the list choice, with the same list selected and its words reloaded.
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Turu hazırla' }));
    expect(screen.getByRole('combobox', { name: 'Kelime listesi' }).textContent).toContain(
      'Test list',
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Oyuna başla' }));
    fireEvent.click(screen.getByRole('button', { name: 'Bitir' }));
    await waitFor(() => expect(f.bodies).toHaveLength(2));
    expect(f.bodies[1]!.completionId).not.toBe(f.bodies[0]!.completionId);
    expect(f.fetchMock.mock.calls.filter((call) => call[0].endsWith('/words'))).toHaveLength(2);
  });
  it('returns to the list choice when the chosen list cannot support a round', async () => {
    const f = fixture(false, () => <Unsuitable>Bu listeyle olmaz.</Unsuitable>);
    fireEvent.click(await screen.findByRole('button', { name: 'Oyuna başla' }));
    expect(screen.getByRole('status').textContent).toContain('Bu listeyle olmaz.');
    fireEvent.click(screen.getByRole('button', { name: 'Başka bir liste seç' }));
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Turu hazırla' }));
    expect(f.bodies).toHaveLength(0);
  });
});
