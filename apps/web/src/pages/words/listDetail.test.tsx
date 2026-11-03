import { routerReady } from '../../test/routerReady';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WordList } from '../../lib/lists';
import type { Word } from '../../lib/words';
import { buildRoutes } from '../../router';

// List detail loading, orientation and status feedback (Batch 2). The network is
// mocked; individual requests can be held open to observe the first render.

const list = (id: string, title: string, wordCount = 0): WordList => ({
  id,
  title,
  wordCount,
  createdAt: '2026-10-21T10:00:00Z',
  updatedAt: '2026-10-21T10:00:00Z',
});
const algorithms = list('0b6f3c2e-1d4a-4f7b-9a51-2c8e5d7f9a01', 'Algorithms', 1);
const october = list('7c1d9e4b-3a2f-4e8d-b6c5-9f0a1b2c3d02', 'Ekim');
const unlisted = list('5e8a7b6c-4d3e-4f2a-8b1c-0d9e8f7a6b03', 'Week 1');
const run: Word = {
  id: 'word-run',
  english: 'run',
  meanings: [{ id: 'meaning-1', turkish: 'koşmak', position: 0 }],
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** What the overview returns, and what the authoritative detail endpoint returns. */
let overview: WordList[];
let server: Record<string, WordList>;
let words: Record<string, Word[]>;
let hold: (url: string) => boolean;
let held: { url: string; release: () => void }[];
const fetchMock = vi.fn<(url: string, options?: RequestInit) => Promise<Response>>();

function respond(url: string, options?: RequestInit): Response {
  if (url.endsWith('/lists')) return json({ lists: overview });
  const [, id = '', wordId] = /\/lists\/([^/]+)(?:\/words(?:\/([^/]+))?)?$/.exec(url) ?? [];
  if (url.includes('/words')) {
    if (options?.method === 'DELETE' && wordId) {
      words[id] = (words[id] ?? []).filter((word) => word.id !== wordId);
      return new Response(null, { status: 204 });
    }
    return json({ words: words[id] ?? [] });
  }
  const found = server[decodeURIComponent(id)];
  return found ? json({ list: found }) : json({ error: { code: 'LIST_NOT_FOUND' } }, 404);
}

beforeEach(() => {
  overview = [algorithms, october];
  server = { [algorithms.id]: algorithms, [october.id]: october, [unlisted.id]: unlisted };
  words = { [algorithms.id]: [run] };
  hold = () => false;
  held = [];
  fetchMock.mockReset();
  fetchMock.mockImplementation((url, options) =>
    hold(url)
      ? new Promise((resolve) => {
          held.push({ url, release: () => resolve(respond(url, options)) });
        })
      : Promise.resolve(respond(url, options)),
  );
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

async function start(path: string) {
  const router = createMemoryRouter(buildRoutes({ includeDevRoutes: false }), {
    basename: '/kelime',
    initialEntries: [`/kelime${path}`],
  });
  await routerReady(router);
  render(<RouterProvider router={router} />);
  return router;
}
const isDetail = (id: string) => (url: string) => url.endsWith(`/lists/${id}`);
const isWords = (id: string) => (url: string) => url.endsWith(`/lists/${id}/words`);
const pageHeading = () => screen.getByRole('heading', { level: 1 });
const statusTexts = () => screen.queryAllByRole('status').map((region) => region.textContent);
function releaseAll() {
  const pending = held;
  held = [];
  act(() => pending.forEach(({ release }) => release()));
}

async function openFromOverview(title: string) {
  const router = await start('/lists');
  const link = await screen.findByRole('link', { name: title });
  fireEvent.click(link);
  await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/kelime\/lists\/[^/]+$/));
  // The router updates its location before React has mounted the page, and the page
  // issues its requests from effects. Wait for them, so a test never releases held
  // requests that have not been sent yet.
  const id = router.state.location.pathname.split('/').pop()!;
  await waitFor(() => {
    const urls = fetchMock.mock.calls.map(([url]) => url);
    expect(urls.some(isDetail(id)) && urls.some(isWords(id))).toBe(true);
  });
  return router;
}

describe('list detail: first render from cached list metadata', () => {
  it('shows the real title, count and actions immediately and focuses that heading', async () => {
    hold = (url) => isDetail(algorithms.id)(url) || isWords(algorithms.id)(url);
    await openFromOverview('Algorithms');

    // Both requests are still open: everything below comes from the overview cache.
    expect(held.map(({ url }) => url).sort()).toEqual(
      [`/api/lists/${algorithms.id}`, `/api/lists/${algorithms.id}/words`].sort(),
    );
    expect(pageHeading().textContent).toBe('Algorithms');
    await waitFor(() => expect(document.activeElement).toBe(pageHeading()));
    expect(screen.getByText(/1 kelime ·/)).toBeDefined();
    expect(screen.getByRole('button', { name: 'Kelime ekle' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Toplu ekle' })).toBeDefined();
    expect(statusTexts()).toContain('Kelimelerin yükleniyor…');
    expect(statusTexts().join(' ')).not.toMatch(/Listelerin yükleniyor/);
    await waitFor(() => expect(document.title).toMatch(/^Algorithms/));

    releaseAll();
    expect(await screen.findByRole('heading', { level: 2, name: 'run' })).toBeDefined();
    expect(pageHeading().textContent).toBe('Algorithms');
  });

  it('keeps the server authoritative: its response replaces the cached title', async () => {
    server[algorithms.id] = { ...algorithms, title: 'Algoritmalar', wordCount: 1 };
    hold = isDetail(algorithms.id);
    await openFromOverview('Algorithms');
    expect(pageHeading().textContent).toBe('Algorithms');

    releaseAll();
    await waitFor(() => expect(pageHeading().textContent).toBe('Algoritmalar'));
  });

  it('shows a real error instead of cached data when the server refuses the list', async () => {
    // Cached in the overview, but no longer accessible (deleted, or not this student's).
    delete server[algorithms.id];
    await openFromOverview('Algorithms');

    expect(await screen.findByRole('alert')).toBeDefined();
    expect(screen.getByRole('alert').textContent).toMatch(/Bu listeye ulaşılamıyor/);
    expect(pageHeading().textContent).toBe('Liste');
    expect(screen.queryByRole('button', { name: 'Kelime ekle' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'run' })).toBeNull();
  });

  it('scopes cached metadata to the list id when switching between lists', async () => {
    hold = (url) => url.includes(october.id) || url.includes(unlisted.id);
    const router = await openFromOverview('Algorithms');
    expect(await screen.findByRole('heading', { level: 2, name: 'run' })).toBeDefined();

    // Another cached list: its own title on the first render, never the previous one.
    await act(() => router.navigate(`/lists/${october.id}`));
    expect(pageHeading().textContent).toBe('Ekim');
    expect(screen.getByText(/0 kelime ·/)).toBeDefined();
    expect(screen.queryByRole('heading', { name: 'run' })).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(pageHeading()));

    // A list that is not in the overview cache falls back to the loading path.
    await act(() => router.navigate(`/lists/${unlisted.id}`));
    expect(pageHeading().textContent).toBe('Liste');
    expect(statusTexts()).toContain('Liste yükleniyor…');

    releaseAll();
    await waitFor(() => expect(pageHeading().textContent).toBe('Week 1'));
  });
});

describe('list detail: direct visit without cached metadata', () => {
  it('shows a single-list loading state, keeps the header stable, then the title', async () => {
    hold = isDetail(algorithms.id);
    await start(`/lists/${algorithms.id}`);

    expect(await screen.findByText('Liste yükleniyor…')).toBeDefined();
    expect(statusTexts().join(' ')).not.toMatch(/Listelerin yükleniyor/);
    expect(pageHeading().textContent).toBe('Liste');
    // The description line and actions are already in place, so the header does not grow.
    expect(screen.getByText(/Kendi kelimelerini ve anlamlarını yönet/)).toBeDefined();
    expect(screen.getByRole('button', { name: 'Kelime ekle' })).toBeDefined();

    releaseAll();
    await waitFor(() => expect(pageHeading().textContent).toBe('Algorithms'));
    expect(await screen.findByRole('heading', { level: 2, name: 'run' })).toBeDefined();
    expect(screen.getByText(/1 kelime ·/)).toBeDefined();
  });
});

describe('list detail: word region entrance', () => {
  const wordRegion = () => screen.getByRole('heading', { level: 2, name: 'run' }).closest('ul')!;

  it('fades the region in once when words arrive after the page, never per word', async () => {
    words[algorithms.id] = [run, { ...run, id: 'word-walk', english: 'walk' }];
    hold = isWords(algorithms.id);
    await openFromOverview('Algorithms');
    releaseAll();
    await screen.findByRole('heading', { level: 2, name: 'run' });

    const region = wordRegion().parentElement!;
    expect(region.classList.contains('fade-in')).toBe(true);
    expect(region.closest('main')!.querySelectorAll('.fade-in')).toHaveLength(1);
    for (const item of wordRegion().children) {
      expect(item.className).not.toMatch(/fade-in|route-enter|animate-/);
      expect(item.getAttribute('style')).toBeNull();
    }
  });

  it('does not fade words that are already cached (the route entrance covers them)', async () => {
    const router = await openFromOverview('Algorithms');
    await screen.findByRole('heading', { level: 2, name: 'run' });
    await act(() => router.navigate('/lists'));
    await screen.findByRole('heading', { level: 1, name: 'Listelerim' });
    await act(() => router.navigate(`/lists/${algorithms.id}`));

    // Rendered on the first frame from cache: no loading text, no second fade.
    expect(screen.getByRole('heading', { level: 2, name: 'run' })).toBeDefined();
    expect(wordRegion().parentElement!.classList.contains('fade-in')).toBe(false);
  });
});

describe('"Listelerime dön" back link', () => {
  function expectBackLink() {
    const link = screen.getByRole<HTMLAnchorElement>('link', { name: 'Listelerime dön' });
    expect(link.getAttribute('href')).toBe('/kelime/lists');
    expect(link.tabIndex).toBe(0);
    link.focus();
    expect(document.activeElement).toBe(link);
    // Recognizable without color: a leading decorative arrow and a 44px outlined target.
    const icon = link.querySelector('svg')!;
    expect(icon.getAttribute('aria-hidden')).toBe('true');
    expect(link.firstElementChild).toBe(icon);
    for (const name of ['min-h-11', 'border', 'rounded-control']) {
      expect(link.classList.contains(name)).toBe(true);
    }
    // The arrow nudge is dropped under reduced motion.
    expect(icon.classList.contains('motion-reduce:group-hover:translate-x-0')).toBe(true);
    return link;
  }

  it('is a router link to /lists on the list page and navigates there', async () => {
    const router = await start(`/lists/${algorithms.id}`);
    await screen.findByRole('heading', { level: 1, name: 'Algorithms' });
    fireEvent.click(expectBackLink());
    await waitFor(() => expect(router.state.location.pathname).toBe('/kelime/lists'));
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole('heading', { level: 1, name: 'Listelerim' }),
      ),
    );
  });

  it('uses the same pattern on the list creation page', async () => {
    const router = await start('/lists/new');
    await screen.findByRole('heading', { level: 1, name: 'Yeni liste oluştur' });
    fireEvent.click(expectBackLink());
    await waitFor(() => expect(router.state.location.pathname).toBe('/kelime/lists'));
  });
});

describe('success status notice', () => {
  it('keeps one status region mounted and shows an iconned success message in it', async () => {
    await start(`/lists/${algorithms.id}`);
    await screen.findByRole('heading', { level: 2, name: 'run' });
    const region = screen.getAllByRole('status').find((element) => !element.textContent)!;
    expect(region).toBeDefined();
    expect(region.childElementCount).toBe(0);

    fireEvent.click(screen.getByRole('button', { name: 'run kelimesini sil' }));
    const dialog = screen.getByRole('dialog', { name: 'Kelimeyi sil' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Kelimeyi sil' }));

    await waitFor(() => expect(region.textContent).toBe('Kelimen silindi.'));
    expect(region.isConnected).toBe(true);
    const box = region.firstElementChild!;
    expect(box.classList.contains('bg-success-soft')).toBe(true);
    expect(box.classList.contains('fade-in')).toBe(true);
    const icon = box.querySelector('svg')!;
    expect(icon.getAttribute('aria-hidden')).toBe('true');
    expect(icon.classList.contains('text-success')).toBe(true);

    // Starting another action clears the message but keeps the region.
    fireEvent.click(screen.getByRole('button', { name: 'Kelime ekle' }));
    expect(region.isConnected).toBe(true);
    expect(region.textContent).toBe('');
  });
});
