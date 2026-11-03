import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ReviewPage from './ReviewPage';
const word = {
  wordId: 'w1',
  english: 'apple',
  meanings: ['elma', 'elma ağacı'],
  knownStreak: 1,
  listId: 'l1',
  listTitle: 'Meyveler',
  activeSessionId: null,
};
afterEach(() => vi.unstubAllGlobals());
function mount(value: object, status = 200) {
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify(value), {
          status,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    ),
  );
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter>
        <ReviewPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
describe('review page', () => {
  it('shows current vocabulary, its list, and one Known as incomplete progress', async () => {
    mount({ evaluatedCount: 2, total: 1, next: null, words: [word] });
    expect(await screen.findByRole('heading', { name: 'apple' })).toBeDefined();
    expect(screen.getByText('elma / elma ağacı')).toBeDefined();
    expect(screen.getByText(/Art arda olumlu katkı: 1 \/ 2/)).toBeDefined();
    expect(screen.getByRole('link', { name: 'Meyveler listesine dön' }).getAttribute('href')).toBe(
      '/lists/l1',
    );
    expect(
      screen
        .getByRole('link', { name: 'Bu listede kelime kartlarıyla çalış' })
        .getAttribute('href'),
    ).toBe('/lists/l1/study');
  });
  it('uses existing setup resume flow for an active session', async () => {
    mount({ evaluatedCount: 1, total: 1, next: null, words: [{ ...word, activeSessionId: 's1' }] });
    expect(
      (
        await screen.findByRole('link', { name: 'Yarım kalan kelime kartı çalışmana devam et' })
      ).getAttribute('href'),
    ).toBe('/lists/l1/study');
  });
  it('explains never-studied vocabulary', async () => {
    mount({ evaluatedCount: 0, total: 0, next: null, words: [] });
    expect(await screen.findByText(/Henüz güncel kelimelerin/)).toBeDefined();
  });
  it('distinguishes no current review priorities from never studied', async () => {
    mount({ evaluatedCount: 2, total: 0, next: null, words: [] });
    expect(await screen.findByText(/Şu anda tekrar önceliği/)).toBeDefined();
  });
  it('explains ordinary selection and every approved positive contribution path', async () => {
    mount({ evaluatedCount: 0, total: 0, next: null, words: [] });
    await screen.findByRole('status');
    expect(screen.getByText(/yalnızca bu kelimelerden oluşacağını garanti etmez/)).toBeDefined();
    expect(screen.getByText(/Yazılı Cevap yanlışları, alternatif cevaplar/)).toBeDefined();
    const rules = screen.getByRole('complementary', { name: 'Tekrar önceliği nasıl kalkar?' });
    expect(rules.textContent).toMatch(/Yazılı Cevap veya Dinle ve Yaz/);
    expect(rules.textContent).toMatch(
      /tamamlanmış Karma Çalışmada Bildim demek ya da hedefi doğru yazmak/,
    );
    expect(rules.textContent).toMatch(
      /seçenekli cevaplar ve ses atlamaları tekrar önceliğini değiştirmez/,
    );
    expect(screen.getByRole('link', { name: 'Zorlandıklarımı Çalış' }).getAttribute('href')).toBe(
      '/study/review',
    );
  });
  it('offers recoverable fetch errors', async () => {
    mount({ error: { code: 'INTERNAL_ERROR' } }, 500);
    expect(await screen.findByRole('alert')).toBeDefined();
  });
  it('rejects invalid progress data', async () => {
    mount({ evaluatedCount: 1, total: 1, next: null, words: [{ ...word, knownStreak: 2 }] });
    expect(await screen.findByRole('alert')).toBeDefined();
  });
  it('requests the next bounded page', async () => {
    mount({ evaluatedCount: 101, total: 101, next: 'cursor', words: [word] });
    fireEvent.click(await screen.findByRole('button', { name: 'Sonraki kelimeler' }));
    expect(await screen.findByRole('button', { name: 'İlk sayfa' })).toBeDefined();
    expect(
      vi
        .mocked(fetch)
        .mock.calls.some((call) => typeof call[0] === 'string' && call[0].includes('after=cursor')),
    ).toBe(true);
  });
});
