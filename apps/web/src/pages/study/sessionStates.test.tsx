import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PuzzleSessionPage } from '../games/PuzzlePage';
import { WrittenSessionPage, WrittenSetupPage } from './WrittenRecallPage';
import { StudySessionPage } from './StudySessionPage';
import { StudySummaryPage } from './StudySummaryPage';
import { studyKeys, type StudySession } from '../../lib/study';

let client: QueryClient;
afterEach(() => {
  client.clear();
  vi.unstubAllGlobals();
});

function mount(element: React.ReactNode, path: string, route: string, cached?: StudySession) {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  if (cached) client.setQueryData(studyKeys.session(cached.id), cached);
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path={route} element={element} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('session loading and recovery headings', () => {
  it.each([
    { finished: false, status: 401 },
    { finished: false, status: 404 },
    { finished: true, status: 401 },
    { finished: true, status: 404 },
  ])(
    'shows authoritative $status errors instead of cached flashcard state (finished: $finished)',
    async ({ finished, status }) => {
      const time = '2026-10-27T08:00:00Z';
      const cached: StudySession = {
        id: 'session',
        listId: 'list',
        listTitle: 'Audit fixture',
        direction: 'en-tr',
        percentage: 100,
        version: 0,
        status: finished ? 'completed' : 'active',
        startedAt: time,
        finishedAt: finished ? time : null,
        counts: {
          total: 1,
          known: finished ? 1 : 0,
          missed: 0,
          removed: 0,
          unanswered: finished ? 0 : 1,
        },
        currentCard: finished
          ? null
          : {
              id: 'card',
              appearance: 1,
              front: ['cat'],
              back: ['kedi'],
              allowedActions: ['known', 'missed', 'skip'],
            },
        cards: [
          {
            id: 'card',
            wordId: 'word',
            english: 'cat',
            meanings: ['kedi'],
            position: 0,
            skipped: false,
            outcome: finished ? 'known' : null,
            answeredAt: finished ? time : null,
          },
        ],
      };
      vi.stubGlobal(
        'fetch',
        vi.fn(() =>
          Promise.resolve(
            new Response(
              JSON.stringify({
                error: { code: status === 401 ? 'UNAUTHENTICATED' : 'STUDY_SESSION_NOT_FOUND' },
              }),
              { status },
            ),
          ),
        ),
      );
      mount(
        finished ? <StudySummaryPage /> : <StudySessionPage />,
        '/study/session',
        '/study/:sessionId',
        cached,
      );
      await screen.findByRole('alert');
      expect(screen.queryByRole('button', { name: 'Bildim' })).toBeNull();
      expect(screen.queryByRole('button', { name: /Çalışmayı bitir/ })).toBeNull();
      expect(screen.queryByText(/^cat$/)).toBeNull();
      expect(screen.getByRole('button', { name: 'Tekrar dene' })).toBeDefined();
    },
  );
  it.each([
    {
      element: <WrittenSessionPage />,
      path: '/study/practice/session',
      route: '/study/practice/:sessionId',
      back: '/study',
      title: 'Çalışma',
    },
    {
      element: <PuzzleSessionPage />,
      path: '/games/puzzles/session',
      route: '/games/puzzles/:sessionId',
      back: '/games',
      title: 'Bulmaca',
    },
  ])(
    'keeps the heading and back link through loading, error and retry at $path',
    async ({ element, path, route, back, title }) => {
      let resolve!: (response: Response) => void;
      const fetchMock = vi.fn(
        () =>
          new Promise<Response>((done) => {
            resolve = done;
          }),
      );
      vi.stubGlobal('fetch', fetchMock);
      mount(element, path, route);
      const heading = screen.getByRole('heading', { level: 1, name: title });
      expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
      expect(screen.getByRole('link').getAttribute('href')).toBe(back);
      expect(screen.getByRole('status').textContent).toMatch(/yükleniyor/);
      act(() => {
        resolve(new Response('{}', { status: 503 }));
      });
      await screen.findByRole('alert');
      expect(screen.getByRole('heading', { level: 1 })).toBe(heading);
      fireEvent.click(screen.getByRole('button', { name: 'Tekrar dene' }));
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
      expect(screen.getByRole('heading', { level: 1 })).toBe(heading);
      expect(screen.getByRole('link').getAttribute('href')).toBe(back);
    },
  );

  it.each(['written-recall', 'listening'] as const)(
    'does not show an orphan separator before the list title loads in %s setup',
    (practiceType) => {
      vi.stubGlobal(
        'fetch',
        vi.fn(() => new Promise<Response>(() => {})),
      );
      mount(
        <WrittenSetupPage practiceType={practiceType} />,
        '/lists/list/setup',
        '/lists/:id/setup',
      );
      const heading = screen.getByRole('heading', { level: 1 });
      const description = heading.closest('header')!.querySelector('p.wrap-anywhere')!;
      expect(description.textContent?.trim()).toBe(
        practiceType === 'listening'
          ? 'İngilizce ifadeyi dinle ve duyduğun ifadeyi yaz. Türkçe anlamların tamamı gösterilir.'
          : 'Türkçe anlamlarından İngilizce karşılığını hatırla.',
      );
      expect(description.textContent).not.toContain('·');
      expect(screen.getByRole('link', { name: 'Listeye dön' }).getAttribute('href')).toBe(
        '/lists/list',
      );
      expect(screen.getByRole('status').textContent).toMatch(/yükleniyor/);
    },
  );
});
