import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import HistoryPage from './HistoryPage';
import { isActivity } from '../../lib/activity';
const session = {
  id: 's1',
  listId: 'l1',
  listTitle: 'Eski liste',
  direction: 'en-tr',
  percentage: 50,
  status: 'ended_early',
  counts: { total: 4, known: 1, missed: 1, removed: 1, unanswered: 1 },
};
const flashcard = { key: 'flashcard:s1', at: '2026-10-22T10:00:00Z', kind: 'flashcard', session };
const game = {
  key: 'game:g1',
  at: '2026-10-22T11:00:00Z',
  kind: 'game',
  game: {
    id: 'g1',
    wordListId: 'l1',
    listTitle: 'Eski liste',
    gameType: 'quiz',
    items: [
      {
        wordId: null,
        english: 'snapshot word',
        meanings: ['eski anlam', 'diğer anlam'],
        outcome: 'incorrect',
        attempts: 1,
      },
    ],
  },
};
afterEach(() => vi.unstubAllGlobals());
function mount(activities: unknown[], status = 200) {
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify(status === 200 ? { activities } : { error: { code: 'INTERNAL_ERROR' } }),
          { status, headers: { 'content-type': 'application/json' } },
        ),
      ),
    ),
  );
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter>
        <HistoryPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
describe('recent history', () => {
  it('shows empty history and safe navigation', async () => {
    mount([]);
    expect(await screen.findByRole('status')).toBeDefined();
    expect(await screen.findByText(/Henüz kaydedilmiş/)).toBeDefined();
    expect(screen.getByRole('link', { name: 'Listelerin' }).getAttribute('href')).toBe('/lists');
  });
  it('shows early-ended sessions with all outcomes and result navigation', async () => {
    mount([flashcard]);
    expect(await screen.findByText(/Erken bitirildi/)).toBeDefined();
    expect(screen.getByText(/Cevaplanmayan: 1/)).toBeDefined();
    expect(
      screen.getByRole('link', { name: 'Kelime kartı sonuçlarını aç' }).getAttribute('href'),
    ).toBe('/study/sessions/s1/summary');
  });
  it('shows normal completion and direction', async () => {
    mount([{ ...flashcard, session: { ...session, status: 'completed', direction: 'tr-en' } }]);
    expect(await screen.findByText(/Türkçe → İngilizce/)).toBeDefined();
  });
  it('uses saved game snapshots including deleted words', async () => {
    mount([game]);
    expect(await screen.findByText('snapshot word')).toBeDefined();
    expect(screen.getByText(/eski anlam \/ diğer anlam/)).toBeDefined();
    expect(screen.getByText(/Yanlış/)).toBeDefined();
  });
  it('shows a recoverable server error', async () => {
    mount([], 500);
    expect(await screen.findByRole('alert')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Tekrar dene' })).toBeDefined();
  });
  it('rejects malformed history', () => {
    expect(isActivity(flashcard)).toBe(true);
    expect(isActivity(game)).toBe(true);
    expect(isActivity({ ...flashcard, session: { ...session, counts: {} } })).toBe(false);
    expect(isActivity({ ...game, at: 'invalid' })).toBe(false);
  });
});
