import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Activity } from '../../lib/activity';
import type { ReviewPage } from '../../lib/review';
import { useEndSession, useStudyAction, type StudySession } from '../../lib/study';
import { RecentActivity } from './RecentActivity';
import { TodayPanel } from './TodayPanel';

const time = '2026-10-26T08:00:00Z';
const reviewWord = {
  wordId: 'word-1',
  english: 'network',
  meanings: ['ağ'],
  knownStreak: 0,
  listId: 'list',
  listTitle: 'Algorithms',
  activeSessionId: null,
};
const emptyReview: ReviewPage = { total: 0, evaluatedCount: 0, next: null, words: [] };
const missedReview: ReviewPage = { total: 1, evaluatedCount: 1, next: null, words: [reviewWord] };
const baseSession: StudySession = {
  id: 'session',
  listId: 'list',
  listTitle: 'Algorithms',
  direction: 'en-tr',
  percentage: 100,
  status: 'active',
  version: 1,
  startedAt: time,
  finishedAt: null,
  counts: { total: 2, known: 0, missed: 1, removed: 0, unanswered: 1 },
  currentCard: {
    id: 'card-2',
    appearance: 1,
    front: ['array'],
    back: ['dizi'],
    allowedActions: ['known', 'skip', 'missed'],
  },
  cards: [
    {
      id: 'card-1',
      wordId: 'word-1',
      english: 'network',
      meanings: ['ağ'],
      position: 0,
      skipped: false,
      outcome: 'missed',
      answeredAt: time,
    },
    {
      id: 'card-2',
      wordId: 'word-2',
      english: 'array',
      meanings: ['dizi'],
      position: 1,
      skipped: false,
      outcome: null,
      answeredAt: null,
    },
  ],
};
const json = (value: unknown) =>
  new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });

function Controls({ ending }: { ending: boolean }) {
  const action = useStudyAction('session');
  const end = useEndSession('session');
  return (
    <button
      onClick={() =>
        ending ? end.mutate() : action.mutate({ cardId: 'card-1', version: 0, action: 'missed' })
      }
    >
      Apply fixture response
    </button>
  );
}

function fixture(response: StudySession = baseSession) {
  let review = emptyReview;
  let activities: Activity[] = [];
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 60_000 }, mutations: { retry: false } },
  });
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    if (init?.method === 'POST') {
      review = missedReview;
      if (response.status !== 'active')
        activities = [
          {
            key: 'flashcard:session',
            at: time,
            kind: 'flashcard',
            session: {
              id: response.id,
              listId: response.listId,
              listTitle: response.listTitle,
              direction: response.direction,
              percentage: response.percentage,
              status: response.status,
              counts: response.counts,
            },
          },
        ];
      return Promise.resolve(json({ session: response, applied: true }));
    }
    if (url === '/api/review') return Promise.resolve(json(review));
    if (url === '/api/activity') return Promise.resolve(json({ activities }));
    throw new Error(`Unexpected mocked request: ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  const mount = () =>
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <TodayPanel />
          <RecentActivity />
          <Controls ending={response.status === 'ended_early'} />
        </MemoryRouter>
      </QueryClientProvider>,
    );
  return {
    mount,
    client,
    fetchMock,
    changeElsewhere: () => {
      review = missedReview;
    },
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('dashboard freshness through the study API boundary (mocked network)', () => {
  it('refreshes a mounted review panel after a card evaluation without reloading history', async () => {
    const f = fixture();
    f.mount();
    await screen.findByText('Tekrar sıran henüz boş.');
    await screen.findByText(/Henüz kaydedilmiş bir çalışman yok/);
    fireEvent.click(screen.getByRole('button', { name: 'Apply fixture response' }));
    await screen.findByText('kelimen tekrar bekliyor');
    expect(
      within(screen.getByRole('region', { name: 'Tekrar sıran' })).getByText('network'),
    ).toBeDefined();
    expect(f.fetchMock.mock.calls.filter(([url]) => url === '/api/activity')).toHaveLength(1);
    f.client.clear();
  });

  it.each(['completed', 'ended_early'] as const)(
    'refreshes saved activities after a %s session',
    async (status) => {
      const response: StudySession = {
        ...baseSession,
        status,
        currentCard: null,
        finishedAt: time,
      };
      if (status === 'completed') {
        response.counts = { ...baseSession.counts, missed: 2, unanswered: 0 };
        response.cards = baseSession.cards.map((card) => ({
          ...card,
          outcome: 'missed',
          answeredAt: time,
        }));
      }
      const f = fixture(response);
      f.mount();
      await screen.findByText(/Henüz kaydedilmiş bir çalışman yok/);
      fireEvent.click(screen.getByRole('button', { name: 'Apply fixture response' }));
      const link = await screen.findByRole('link', { name: 'Kelime kartları · Algorithms' });
      expect(link.getAttribute('href')).toBe('/study/sessions/session/summary');
      await screen.findByText('kelimen tekrar bekliyor');
      f.client.clear();
    },
  );

  it('refreshes another-device changes when panels remount inside the normal cache lifetime', async () => {
    const f = fixture();
    const first = f.mount();
    await screen.findByText('Tekrar sıran henüz boş.');
    first.unmount();
    f.changeElsewhere();
    f.mount();
    await screen.findByText('kelimen tekrar bekliyor');
    await waitFor(() =>
      expect(f.fetchMock.mock.calls.filter(([url]) => url === '/api/review')).toHaveLength(2),
    );
    f.client.clear();
  });
});
