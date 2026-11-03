import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router';
import { ListDetailPage } from '../../pages/words/ListDetailPage';
import { fetchExamples, type ExampleSentence } from '../../lib/examples';
import { ExamplePanel } from './ExamplePanel';

const requestUrl = (value: Parameters<typeof fetch>[0]) =>
  typeof value === 'string' ? value : value instanceof URL ? value.href : value.url;

const make = (id = '1', translation = true): ExampleSentence => ({
  id,
  text: `We ran home ${id}.`,
  provider: 'Tatoeba',
  matchedForm: 'ran',
  contributor: 'Writer',
  sourceUrl: `https://tatoeba.org/en/sentences/show/${id}`,
  license: { name: 'CC BY 2.0 FR', url: 'https://creativecommons.org/licenses/by/2.0/fr/' },
  ...(translation
    ? {
        translation: {
          id: '11',
          text: 'Eve koştuk.',
          contributor: 'Translator',
          sourceUrl: 'https://tatoeba.org/en/sentences/show/11',
          license: { name: 'CC0 1.0', url: 'https://creativecommons.org/publicdomain/zero/1.0/' },
        },
      }
    : {}),
});
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
let client: QueryClient;
const fetcher = vi.fn<typeof fetch>();
const path = '/lists/list/words/run/examples';
const trigger = () => screen.getByRole('button', { name: 'Örnek cümle göster' });
function renderPanel(props: { path?: string; revision?: string; enabled?: boolean } = {}) {
  return render(<ExamplePanel path={path} {...props} />, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
}
beforeEach(() => {
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  fetcher.mockReset().mockImplementation(() => Promise.resolve(json({ examples: [make()] })));
  vi.stubGlobal('fetch', fetcher);
});
afterEach(() => {
  client.clear();
  vi.unstubAllGlobals();
});

describe('shared explicit example panel', () => {
  it('never fetches on mount, ordinary rerender, or enable/reveal', () => {
    const view = renderPanel({ enabled: false });
    expect((trigger() as HTMLButtonElement).disabled).toBe(true);
    view.rerender(<ExamplePanel path={path} enabled />);
    view.rerender(<ExamplePanel path={path} enabled />);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('expands inline on explicit interaction, with correct control semantics and loading', async () => {
    let release!: (value: Response) => void;
    fetcher.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    renderPanel();
    const button = trigger();
    button.focus();
    fireEvent.click(button);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(document.getElementById(button.getAttribute('aria-controls')!)?.hidden).toBe(false);
    expect(screen.getByRole('status').textContent).toMatch(/yükleniyor/);
    expect(document.activeElement).toBe(button);
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    await act(() => Promise.resolve(release(json({ examples: [make()] }))));
    await screen.findByText('We ran home 1.');
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]?.[0]).toBe('/api' + path);
  });
  it('renders English, optional Turkish, contributors and safe source/license links', async () => {
    renderPanel();
    fireEvent.click(trigger());
    expect((await screen.findByText('We ran home 1.')).getAttribute('lang')).toBe('en');
    expect(screen.getByText('Eve koştuk.').getAttribute('lang')).toBe('tr');
    expect(screen.getByText('Katkı: Writer')).toBeDefined();
    expect(screen.getByText('Katkı: Translator')).toBeDefined();
    for (const link of screen.getAllByRole('link')) {
      expect(link.getAttribute('href')).toMatch(/^https:\/\/(tatoeba.org|creativecommons.org)\//u);
      expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    }
    expect(screen.getByRole('link', { name: /Kaynak: Tatoeba/ }).getAttribute('href')).toBe(
      'https://tatoeba.org/en/sentences/show/1',
    );
    expect(screen.getByRole('link', { name: /Çeviri kaynağı/ })).toBeDefined();
  });
  it('supports English-only examples without inferring translations', async () => {
    fetcher.mockImplementationOnce(() => Promise.resolve(json({ examples: [make('2', false)] })));
    renderPanel();
    fireEvent.click(trigger());
    await screen.findByText('We ran home 2.');
    expect(screen.queryByText('Eve koştuk.')).toBeNull();
    expect(screen.queryByRole('link', { name: /Çeviri kaynağı/ })).toBeNull();
  });
  it('distinguishes an honest no-results state', async () => {
    fetcher.mockImplementationOnce(() => Promise.resolve(json({ examples: [] })));
    renderPanel();
    fireEvent.click(trigger());
    await screen.findByText('Bu kelime için uygun örnek cümle bulunamadı.');
    expect(screen.queryByRole('alert')).toBeNull();
  });
  it.each([
    ['EXAMPLES_TIMEOUT', 'zaman aşımına'],
    ['EXAMPLES_RATE_LIMITED', 'İstek sınırına'],
    ['EXAMPLES_BUSY', 'yoğun'],
    ['EXAMPLES_UNAVAILABLE', 'yüklenemiyor'],
    ['EXAMPLES_UNSUPPORTED', 'desteklenmiyor'],
  ])('shows %s and only manually retries', async (code, message) => {
    fetcher.mockImplementationOnce(() =>
      Promise.resolve(json({ error: { code } }, code === 'EXAMPLES_RATE_LIMITED' ? 429 : 503)),
    );
    renderPanel();
    fireEvent.click(trigger());
    expect((await screen.findByRole('alert')).textContent).toContain(message);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const retry = screen.getByRole('button', { name: 'Tekrar dene' });
    retry.focus();
    fireEvent.click(retry);
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Örnek cümleleri kapat' }),
    );
    await screen.findByText('We ran home 1.');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('handles frontend network failure without claiming no results', async () => {
    fetcher.mockRejectedValueOnce(new TypeError('Network'));
    renderPanel();
    fireEvent.click(trigger());
    expect((await screen.findByRole('alert')).textContent).toMatch(/Bağlantını kontrol/);
    expect(screen.queryByText('Bu kelime için uygun örnek cümle bulunamadı.')).toBeNull();
  });
  it('closing and reopening is a new explicit request with recent ids', async () => {
    fetcher
      .mockImplementationOnce(() =>
        Promise.resolve(json({ examples: [make('1'), make('2', false), make('3', false)] })),
      )
      .mockImplementationOnce(() => Promise.resolve(json({ examples: [make('4', false)] })));
    renderPanel();
    fireEvent.click(trigger());
    await screen.findByText('We ran home 1.');
    fireEvent.click(screen.getByRole('button', { name: 'Örnek cümleleri kapat' }));
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText('We ran home 1.')).toBeNull();
    fireEvent.click(trigger());
    await screen.findByText('We ran home 4.');
    expect(fetcher.mock.calls[1]?.[0]).toBe('/api' + path + '?exclude=1%2C2%2C3');
  });
  it('bounds recent ids to nine across repeated explicit lookups', async () => {
    let number = 0;
    fetcher.mockImplementation(() =>
      Promise.resolve(json({ examples: [make(String(++number), false)] })),
    );
    renderPanel();
    for (let index = 1; index <= 12; index++) {
      fireEvent.click(trigger());
      await screen.findByText(`We ran home ${index}.`);
      fireEvent.click(screen.getByRole('button', { name: 'Örnek cümleleri kapat' }));
    }
    const url = new URL(requestUrl(fetcher.mock.calls.at(-1)![0]), 'https://local.test');
    expect(url.searchParams.get('exclude')?.split(',')).toEqual([
      '3',
      '4',
      '5',
      '6',
      '7',
      '8',
      '9',
      '10',
      '11',
    ]);
  });
  it('prevents stale responses after resource changes and cancels the old request', async () => {
    let release!: (value: Response) => void;
    fetcher.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const view = renderPanel();
    fireEvent.click(trigger());
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    const oldSignal = fetcher.mock.calls[0]?.[1]?.signal;
    view.rerender(<ExamplePanel path="/lists/list/words/new/examples" />);
    expect(oldSignal?.aborted).toBe(true);
    await act(() => Promise.resolve(release(json({ examples: [make()] }))));
    expect(screen.queryByText('We ran home 1.')).toBeNull();
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('ignores closed-panel responses even if fetch ignores abort', async () => {
    let release!: (value: Response) => void;
    fetcher.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    renderPanel();
    fireEvent.click(trigger());
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'Örnek cümleleri kapat' }));
    await act(() => Promise.resolve(release(json({ examples: [make()] }))));
    expect(screen.queryByText('We ran home 1.')).toBeNull();
    fireEvent.click(trigger());
    await screen.findByText('We ran home 1.');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('renders upstream content as text, never HTML', async () => {
    fetcher.mockImplementationOnce(() =>
      Promise.resolve(json({ examples: [{ ...make(), text: '<img src=x onerror=alert(1)>' }] })),
    );
    const view = renderPanel();
    fireEvent.click(trigger());
    await screen.findByText('<img src=x onerror=alert(1)>');
    expect(view.container.querySelector('img')).toBeNull();
  });
  it.each([
    { sourceUrl: 'javascript:alert(1)' },
    { sourceUrl: 'https://evil.test/1' },
    { license: { name: 'CC BY 2.0 FR', url: 'https://evil.test/license' } },
    { id: '0' },
    { text: '' },
  ])('rejects unsafe API source metadata %s', async (override) => {
    fetcher.mockImplementationOnce(() =>
      Promise.resolve(json({ examples: [{ ...make(), ...override }] })),
    );
    renderPanel();
    fireEvent.click(trigger());
    await screen.findByRole('alert');
    expect(screen.queryByRole('link')).toBeNull();
  });
  it('rejects more than three rather than displaying an invalid API response', async () => {
    fetcher.mockImplementationOnce(() =>
      Promise.resolve(json({ examples: [make('1'), make('2'), make('3'), make('4')] })),
    );
    renderPanel();
    fireEvent.click(trigger());
    await screen.findByRole('alert');
    expect(screen.queryByRole('list')).toBeNull();
  });
  it('the typed client preserves relative app paths and cancellation', async () => {
    const controller = new AbortController();
    await fetchExamples(path, [], controller.signal);
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({
      method: 'GET',
      credentials: 'same-origin',
      signal: controller.signal,
    });
  });
});
describe('list row integration', () => {
  it('loads personal words with no example controls or requests and preserves CRUD', async () => {
    const list = {
      id: 'list',
      title: 'Words',
      wordCount: 2,
      createdAt: '2026-10-22T09:00:00Z',
      updatedAt: '2026-10-22T09:00:00Z',
    };
    fetcher.mockImplementation((input) =>
      Promise.resolve().then(() => {
        const url = requestUrl(input);
        if (url.includes('/examples')) return json({ examples: [make()] });
        if (url.endsWith('/active')) return json({ session: null });
        if (url.endsWith('/words'))
          return json({
            words: ['run', 'book'].map((english) => ({
              id: english,
              english,
              meanings: [
                {
                  id: english + '-meaning',
                  turkish: english === 'run' ? 'koşmak' : 'kitap',
                  position: 0,
                },
              ],
            })),
          });
        return json({ list });
      }),
    );
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/lists/list']}>
          <Routes>
            <Route path="/lists/:id" element={<ListDetailPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await screen.findByRole('heading', { name: 'run' });
    expect(
      fetcher.mock.calls.filter(([url]) => requestUrl(url).includes('/examples')),
    ).toHaveLength(0);
    const row = screen.getByRole('heading', { name: 'run' }).closest('li')!;
    const other = screen.getByRole('heading', { name: 'book' }).closest('li')!;
    expect(within(row).queryByRole('button', { name: 'Örnek cümle göster' })).toBeNull();
    expect(within(other).queryByText('We ran home 1.')).toBeNull();
    expect(within(other).queryByRole('button', { name: 'Örnek cümle göster' })).toBeNull();
    expect(within(row).getByRole('button', { name: 'run kelimesini düzenle' })).toBeDefined();
    expect(within(row).getByRole('button', { name: 'run kelimesini sil' })).toBeDefined();
    await waitFor(() =>
      expect(
        fetcher.mock.calls.filter(([url]) => requestUrl(url).includes('/examples')),
      ).toHaveLength(0),
    );
  });
});
