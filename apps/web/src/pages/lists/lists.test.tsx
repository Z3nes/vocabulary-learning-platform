import { routerReady } from '../../test/routerReady';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildRoutes } from '../../router';
import type { WordList } from '../../lib/lists';

const item: WordList = {
  id: 'e542713d-a716-401f-8986-f6437921ed14',
  title: 'Algorithms',
  createdAt: '2026-10-21T10:00:00Z',
  updatedAt: '2026-10-21T10:00:00Z',
  wordCount: 0,
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
let stored: WordList[];
const fetchMock = vi.fn<(url: string, options?: RequestInit) => Promise<Response>>();
beforeEach(() => {
  stored = [];
  fetchMock.mockReset();
  fetchMock.mockImplementation((url, options) => {
    if (options?.method === 'POST') {
      const body = JSON.parse(options.body as string) as { title: string };
      stored.push({ ...item, title: body.title });
      return Promise.resolve(json({ list: stored[0] }, 201));
    }
    if (options?.method === 'PATCH') {
      const body = JSON.parse(options.body as string) as { title: string };
      stored[0] = { ...stored[0]!, title: body.title };
      return Promise.resolve(json({ list: stored[0] }));
    }
    if (options?.method === 'DELETE') {
      stored = [];
      return Promise.resolve(new Response(null, { status: 204 }));
    }
    if (url.endsWith('/words')) return Promise.resolve(json({ words: [] }));
    return Promise.resolve(
      url.endsWith('/lists') ? json({ lists: stored }) : json({ list: stored[0] }),
    );
  });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
});
async function start(path = '/lists') {
  const router = createMemoryRouter(buildRoutes({ includeDevRoutes: false }), {
    basename: '/kelime',
    initialEntries: [`/kelime${path}`],
  });
  await routerReady(router);
  render(<RouterProvider router={router} />);
  return router;
}
function submitForm() {
  fireEvent.submit(screen.getByRole('textbox', { name: /Liste başlığı/ }).closest('form')!);
}

describe('personal list screens through the API boundary (mocked network)', () => {
  it('keeps an active search clearable after deletion drops below the search threshold', async () => {
    stored = [
      item,
      ...Array.from({ length: 6 }, (_, i) => ({ ...item, id: `list-${i}`, title: `List ${i}` })),
    ];
    const implementation = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation((url, options) => {
      if (options?.method === 'DELETE') {
        stored = stored.filter((list) => list.id !== item.id);
        return Promise.resolve(new Response(null, { status: 204 }));
      }
      return implementation(url, options);
    });
    await start();
    fireEvent.change(await screen.findByRole('searchbox', { name: 'Listelerde ara' }), {
      target: { value: 'Algorithms' },
    });
    expect(screen.queryByRole('link', { name: 'List 0' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Algorithms listesini sil' }));
    fireEvent.click(
      within(screen.getByRole('dialog', { name: 'Listeyi sil' })).getByRole('button', {
        name: 'Listeyi sil',
      }),
    );
    await screen.findByText(/ile eşleşen bir liste yok/);
    const search = screen.getByRole<HTMLInputElement>('searchbox', { name: 'Listelerde ara' });
    expect(search.value).toBe('Algorithms');
    search.focus();
    fireEvent.change(search, { target: { value: '' } });
    expect(document.activeElement).toBe(search);
    expect(search.isConnected).toBe(true);
    expect(screen.getByRole('link', { name: 'List 0' })).toBeDefined();
    expect(screen.getByRole('link', { name: 'List 5' })).toBeDefined();
  });

  it('uses one native keyboard-focusable router link stretched over the card surface', async () => {
    stored = [{ ...item }];
    const router = await start();
    const link = await screen.findByRole<HTMLAnchorElement>('link', { name: 'Algorithms' });
    expect(link.getAttribute('href')).toBe(`/kelime/lists/${item.id}`);
    expect(link.tabIndex).toBe(0);
    link.focus();
    expect(document.activeElement).toBe(link);
    expect(link.classList.contains('list-card-link')).toBe(true);
    expect(link.classList.contains('after:inset-0')).toBe(true);
    expect(link.querySelector('button')).toBeNull();
    // Native Enter activation produces a click; jsdom has no keyboard default action or pseudo-element hit testing.
    fireEvent.click(link);
    await waitFor(() => expect(router.state.location.pathname).toBe(`/kelime/lists/${item.id}`));
  });
  it('marks the card as navigable without moving it, and keeps hover off the action buttons', async () => {
    stored = [{ ...item }];
    await start();
    const link = await screen.findByRole('link', { name: 'Algorithms' });
    const card = link.closest('li')!;
    // Hover/press styling is in global.css, keyed to the link; none sits on the card itself.
    expect(card.classList.contains('list-card')).toBe(true);
    expect(card.className).not.toMatch(/hover:|active:|translate|scale/);
    // Trailing arrow: decorative, outside the link text (accessible name stays the title).
    const arrow = card.querySelector('.list-card-arrow')!;
    expect(arrow.getAttribute('aria-hidden')).toBe('true');
    expect(link.contains(arrow)).toBe(false);
    expect(link.textContent).toBe('Algorithms');
    // Buttons stay siblings layered above the stretched link.
    for (const button of within(card).getAllByRole('button')) {
      expect(link.contains(button)).toBe(false);
      expect(button.classList.contains('relative')).toBe(true);
      expect(button.classList.contains('z-10')).toBe(true);
    }
  });
  it('shows the deletion result in the persistent, iconned success status region', async () => {
    stored = [{ ...item }];
    await start();
    fireEvent.click(await screen.findByRole('button', { name: 'Algorithms listesini sil' }));
    const region = screen.getByRole('status');
    expect(region.textContent).toBe('');
    const dialog = screen.getByRole('dialog', { name: 'Listeyi sil' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Listeyi sil' }));
    await waitFor(() => expect(region.textContent).toBe('Listen silindi.'));
    expect(region.isConnected).toBe(true);
    expect(region.firstElementChild?.classList.contains('bg-success-soft')).toBe(true);
    expect(region.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });
  it.each(['rename', 'delete'] as const)(
    'keeps the %s control independent of card navigation',
    async (action) => {
      stored = [{ ...item }];
      const router = await start();
      const trigger = await screen.findByRole('button', {
        name:
          action === 'rename'
            ? 'Algorithms listesini yeniden adlandır'
            : 'Algorithms listesini sil',
      });
      expect(trigger.closest('a')).toBeNull();
      fireEvent.click(trigger);
      const dialog = screen.getByRole('dialog', {
        name: action === 'rename' ? 'Listeyi yeniden adlandır' : 'Listeyi sil',
      });
      expect(router.state.location.pathname).toBe('/kelime/lists');
      fireEvent.click(within(dialog).getByRole('button', { name: 'Vazgeç' }));
      await waitFor(() => expect(document.activeElement).toBe(trigger));
      expect(router.state.location.pathname).toBe('/kelime/lists');
    },
  );
  it('shows loading, then persisted empty data', async () => {
    let resolve!: (value: Response) => void;
    fetchMock.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    await start();
    expect(screen.getByText('Listelerin yükleniyor…')).toBeDefined();
    act(() => {
      resolve(json({ lists: [] }));
    });
    expect(await screen.findByRole('heading', { name: 'Henüz bir listen yok' })).toBeDefined();
  });
  it('shows a network error and retries successfully', async () => {
    fetchMock.mockRejectedValueOnce(new Error('offline'));
    await start();
    expect(await screen.findByRole('alert')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Tekrar dene' }));
    expect(await screen.findByRole('heading', { name: 'Henüz bir listen yok' })).toBeDefined();
  });
  it('validates creation, blocks duplicate submissions, and shares saved data with the dashboard', async () => {
    const router = await start('/lists/new');
    const input = screen.getByRole('textbox', { name: /Liste başlığı/ });
    fireEvent.change(input, { target: { value: '  ' } });
    submitForm();
    expect(await screen.findByRole('alert')).toBeDefined();
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: '  Algorithms  ' } });
    submitForm();
    submitForm();
    expect(await screen.findByRole('link', { name: 'Algorithms' })).toBeDefined();
    expect(fetchMock.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(
      1,
    );
    // The dashboard reuses the cached lists; it loads only its own panels (review, activity).
    const listRequests = () => fetchMock.mock.calls.filter(([url]) => url.endsWith('/lists'));
    const before = listRequests().length;
    await act(() => router.navigate('/'));
    expect(await screen.findByRole('link', { name: 'Algorithms' })).toBeDefined();
    expect(listRequests()).toHaveLength(before);
    expect(screen.getByRole('link', { name: 'Algorithms' }).getAttribute('href')).toBe(
      `/kelime/lists/${item.id}`,
    );
  });
  it('translates server validation errors on creation', async () => {
    fetchMock.mockResolvedValueOnce(json({ error: { code: 'TITLE_TOO_LONG' } }, 400));
    await start('/lists/new');
    fireEvent.change(screen.getByRole('textbox', { name: /Liste başlığı/ }), {
      target: { value: 'Algorithms' },
    });
    submitForm();
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Liste başlığını en fazla 100 karakterle sınırla.',
    );
  });
  it('announces a pending creation and prevents repeated form submission', async () => {
    let resolve!: (value: Response) => void;
    fetchMock.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    await start('/lists/new');
    fireEvent.change(screen.getByRole('textbox', { name: /Liste başlığı/ }), {
      target: { value: 'Algorithms' },
    });
    submitForm();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Oluştur/ }).getAttribute('aria-busy')).toBe(
        'true',
      ),
    );
    submitForm();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    stored = [{ ...item }];
    act(() => {
      resolve(json({ list: item }, 201));
    });
    expect(await screen.findByRole('link', { name: 'Algorithms' })).toBeDefined();
  });
  it('renames with a prefilled native dialog, validates and restores focus after save', async () => {
    stored = [{ ...item }];
    await start();
    const trigger = await screen.findByRole('button', {
      name: 'Algorithms listesini yeniden adlandır',
    });
    trigger.focus();
    fireEvent.click(trigger);
    const dialog = screen.getByRole('dialog', { name: 'Listeyi yeniden adlandır' });
    const input = within(dialog).getByRole<HTMLInputElement>('textbox', {
      name: /Liste başlığı/,
    });
    expect(input.value).toBe('Algorithms');
    expect(document.activeElement).toBe(input);
    fireEvent.change(input, { target: { value: '  ' } });
    submitForm();
    expect(await within(dialog).findByRole('alert')).toBeDefined();
    fireEvent.change(input, { target: { value: 'Veri Yapıları' } });
    submitForm();
    submitForm();
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Listeyi yeniden adlandır' })).toBeNull(),
    );
    expect(await screen.findByRole('link', { name: 'Veri Yapıları' })).toBeDefined();
    expect(document.activeElement).toBe(trigger);
    expect(fetchMock.mock.calls.filter(([, options]) => options?.method === 'PATCH')).toHaveLength(
      1,
    );
  });
  it('supports explicit rename cancellation and native Escape closing', async () => {
    stored = [{ ...item }];
    await start();
    const trigger = await screen.findByRole('button', {
      name: 'Algorithms listesini yeniden adlandır',
    });
    fireEvent.click(trigger);
    fireEvent.click(
      within(screen.getByRole('dialog', { name: 'Listeyi yeniden adlandır' })).getByRole('button', {
        name: 'Vazgeç',
      }),
    );
    await waitFor(() => expect(document.activeElement).toBe(trigger));
    fireEvent.click(trigger);
    const dialog = screen.getByRole<HTMLDialogElement>('dialog', {
      name: 'Listeyi yeniden adlandır',
    });
    // jsdom cannot implement native Escape; model its default close event explicitly.
    fireEvent(dialog, new Event('cancel', { cancelable: true }));
    act(() => dialog.close());
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Listeyi yeniden adlandır' })).toBeNull(),
    );
    expect(fetchMock.mock.calls.some(([, options]) => options?.method === 'PATCH')).toBe(false);
  });
  it('keeps the rename dialog open on a server error', async () => {
    stored = [{ ...item }];
    await start();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Algorithms listesini yeniden adlandır' }),
    );
    fetchMock.mockResolvedValueOnce(json({ error: { code: 'INTERNAL_ERROR' } }, 500));
    submitForm();
    expect(await screen.findByRole('alert')).toBeDefined();
    expect(screen.getByRole('dialog', { name: 'Listeyi yeniden adlandır' })).toBeDefined();
  });
  it('requires confirmation before deletion and returns focus to the heading afterward', async () => {
    stored = [{ ...item }];
    await start();
    const trigger = await screen.findByRole('button', { name: 'Algorithms listesini sil' });
    fireEvent.click(trigger);
    let dialog = screen.getByRole('dialog', { name: 'Listeyi sil' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Vazgeç' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Listeyi sil' })).toBeNull());
    expect(stored).toHaveLength(1);
    fireEvent.click(trigger);
    dialog = screen.getByRole('dialog', { name: 'Listeyi sil' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Listeyi sil' }));
    expect(await screen.findByRole('heading', { name: 'Henüz bir listen yok' })).toBeDefined();
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole('heading', { level: 1, name: 'Listelerim' }),
      ),
    );
    const call = fetchMock.mock.calls.find(([, options]) => options?.method === 'DELETE');
    expect(call?.[1]?.body).toBeUndefined();
    expect(call?.[1]?.headers).not.toHaveProperty('content-type');
  });
  it('shows only the four most recently updated lists on the dashboard', async () => {
    stored = Array.from({ length: 6 }, (_, index) => ({
      ...item,
      id: `id-${index}`,
      title: `List ${index}`,
    }));
    await start('/');
    expect(await screen.findByRole('link', { name: 'List 0' })).toBeDefined();
    expect(screen.getByRole('link', { name: 'List 3' })).toBeDefined();
    expect(screen.queryByRole('link', { name: 'List 4' })).toBeNull();
  });
  it('reports a delete failure without closing the confirmation dialog', async () => {
    stored = [{ ...item }];
    await start();
    fireEvent.click(await screen.findByRole('button', { name: 'Algorithms listesini sil' }));
    fetchMock.mockRejectedValueOnce(new Error('offline'));
    const dialog = screen.getByRole('dialog', { name: 'Listeyi sil' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Listeyi sil' }));
    expect(await within(dialog).findByRole('alert')).toBeDefined();
    expect(screen.getByRole('dialog', { name: 'Listeyi sil' })).toBeDefined();
    expect(stored).toHaveLength(1);
  });
});
