import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  practiceKeys,
  useActivePractice,
  usePractice,
  usePracticeCommand,
  type PracticeSession,
  type PracticeType,
} from './practice';
import {
  studyKeys,
  useActiveSession,
  useStudyAction,
  useStudySession,
  useStartSession,
  useEndSession,
  type StudySession,
} from './study';

const time = '2026-10-27T08:00:00Z';
const study: StudySession = {
  id: 'session',
  listId: 'list',
  listTitle: 'Fixture',
  direction: 'en-tr',
  percentage: 100,
  status: 'active',
  version: 0,
  startedAt: time,
  finishedAt: null,
  counts: { total: 1, known: 0, missed: 0, removed: 0, unanswered: 1 },
  currentCard: {
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
      outcome: null,
      answeredAt: null,
    },
  ],
};
function practice(type: PracticeType): PracticeSession {
  return {
    id: 'session',
    listId: 'list',
    listTitle: 'Fixture',
    practiceType: type,
    percentage: 100,
    eligibleCount: 1,
    questionCount: 1,
    currentPosition: 0,
    version: 0,
    status: 'ACTIVE',
    createdAt: time,
    completedAt: null,
    canceledAt: null,
    currentQuestion: { id: 'question', position: 0, meanings: ['kedi'], evaluation: null },
    results: [],
    correctCount: 0,
    masteryEligibleCount: 0,
    masteryAppliedCount: 0,
    ...(type === 'mixed'
      ? {
          selfKnownCount: 0,
          selfMissedCount: 0,
          distribution: (['flashcard', 'written-recall', 'listening', 'choice'] as const).map(
            (activityType) => ({ activityType, total: 0, correct: 0, incorrect: 0, skipped: 0 }),
          ),
        }
      : {}),
  };
}
const json = (session: PracticeSession | StudySession) =>
  new Response(JSON.stringify({ session, applied: true }), {
    headers: { 'content-type': 'application/json' },
  });
function deferred() {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
const clients: QueryClient[] = [];
function context() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  clients.push(client);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
}
afterEach(() => {
  clients.splice(0).forEach((client) => client.clear());
  vi.unstubAllGlobals();
});

describe('monotonic server session revisions under delayed network responses', () => {
  it('replaces an obsolete active entry when a newly started session is acknowledged', async () => {
    const { client, wrapper } = context();
    client.setQueryData(studyKeys.active('list'), study);
    const next = { ...study, id: 'new-session' };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(next)));
    const { result } = renderHook(() => useStartSession('list'), { wrapper });
    await act(() => result.current.mutateAsync({ percentage: 100, direction: 'en-tr' }));
    expect(client.getQueryData<StudySession>(studyKeys.active('list'))?.id).toBe(next.id);
  });

  it('keeps a newly active entry when a retired session end response arrives', async () => {
    const { client, wrapper } = context();
    const next = { ...study, id: 'new-session' };
    client.setQueryData(studyKeys.active('list'), next);
    const ended: StudySession = {
      ...study,
      version: 1,
      status: 'ended_early',
      currentCard: null,
      finishedAt: time,
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(ended)));
    const { result } = renderHook(() => useEndSession(study.id), { wrapper });
    await act(() => result.current.mutateAsync());
    expect(client.getQueryData<StudySession>(studyKeys.active('list'))?.id).toBe(next.id);
  });
  it('does not resurrect an active practice session from an earlier discovery response after completion', async () => {
    const { client, wrapper } = context(),
      pending = deferred(),
      before = practice('written-recall');
    const after: PracticeSession = {
      ...before,
      version: 1,
      status: 'COMPLETED',
      currentQuestion: null,
      completedAt: time,
    };
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init?: RequestInit) =>
        init?.method === 'POST' ? Promise.resolve(json(after)) : pending.promise,
      ),
    );
    const { result } = renderHook(
      () => ({ query: useActivePractice('list'), command: usePracticeCommand(before.id) }),
      { wrapper },
    );
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    await act(() => result.current.command.mutateAsync({ action: 'complete' }));
    await act(async () => {
      pending.resolve(json(before));
      await pending.promise;
    });
    await waitFor(() => expect(result.current.query.isFetching).toBe(false));
    expect(result.current.query.data).toBeNull();
    expect(client.getQueryData<PracticeSession>(practiceKeys.session(before.id))?.status).toBe(
      'COMPLETED',
    );
  });

  it('does not resurrect an active flashcard session from an earlier discovery response after completion', async () => {
    const { wrapper } = context(),
      pending = deferred();
    const after: StudySession = {
      ...study,
      version: 1,
      status: 'completed',
      currentCard: null,
      finishedAt: time,
      counts: { ...study.counts, known: 1, unanswered: 0 },
      cards: study.cards.map((card) => ({ ...card, outcome: 'known', answeredAt: time })),
    };
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init?: RequestInit) =>
        init?.method === 'POST' ? Promise.resolve(json(after)) : pending.promise,
      ),
    );
    const { result } = renderHook(
      () => ({ query: useActiveSession('list'), command: useStudyAction(study.id) }),
      { wrapper },
    );
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    await act(() =>
      result.current.command.mutateAsync({ action: 'known', cardId: 'card', version: 0 }),
    );
    await act(async () => {
      pending.resolve(json(study));
      await pending.promise;
    });
    await waitFor(() => expect(result.current.query.isFetching).toBe(false));
    expect(result.current.query.data).toBeNull();
  });
  it.each(['written-recall', 'listening', 'mixed'] as const)(
    'does not let an earlier %s GET overwrite an acknowledged command',
    async (type) => {
      const { client, wrapper } = context();
      const before = practice(type),
        after = { ...before, version: 1 };
      client.setQueryData(practiceKeys.session(before.id), before);
      const pending = deferred();
      const fetcher = vi.fn((_url: string, init?: RequestInit) =>
        init?.method === 'POST' ? Promise.resolve(json(after)) : pending.promise,
      );
      vi.stubGlobal('fetch', fetcher);
      const { result } = renderHook(
        () => ({ query: usePractice(before.id), command: usePracticeCommand(before.id) }),
        { wrapper },
      );
      await waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
      await act(() =>
        result.current.command.mutateAsync({
          action: 'reveal',
          questionId: 'question',
          version: 0,
        }),
      );
      await act(async () => {
        pending.resolve(json(before));
        await pending.promise;
      });
      await waitFor(() => expect(result.current.query.isFetching).toBe(false));
      expect(result.current.query.data?.version).toBe(1);
      expect(client.getQueryData<PracticeSession>(practiceKeys.active('list', type))?.version).toBe(
        1,
      );
    },
  );

  it.each(['written-recall', 'listening', 'mixed'] as const)(
    'does not let a delayed %s mutation roll back a newer command response',
    async (type) => {
      const { client, wrapper } = context();
      const before = practice(type),
        pending = deferred();
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockReturnValueOnce(pending.promise)
          .mockResolvedValue(json({ ...before, version: 2 })),
      );
      const { result } = renderHook(
        () => ({ first: usePracticeCommand(before.id), second: usePracticeCommand(before.id) }),
        { wrapper },
      );
      let first!: Promise<PracticeSession>;
      act(() => {
        first = result.current.first.mutateAsync({
          action: 'reveal',
          questionId: 'question',
          version: 0,
        });
      });
      await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
      await act(() =>
        result.current.second.mutateAsync({ action: 'next', questionId: 'question', version: 1 }),
      );
      await act(async () => {
        pending.resolve(json({ ...before, version: 1 }));
        await first;
      });
      expect(client.getQueryData<PracticeSession>(practiceKeys.session(before.id))?.version).toBe(
        2,
      );
      expect(client.getQueryData<PracticeSession>(practiceKeys.active('list', type))?.version).toBe(
        2,
      );
    },
  );

  it('does not let an earlier flashcard GET overwrite an acknowledged evaluation', async () => {
    const { client, wrapper } = context(),
      pending = deferred();
    client.setQueryData(studyKeys.session(study.id), study);
    const after = { ...study, version: 1 };
    const fetcher = vi.fn((_url: string, init?: RequestInit) =>
      init?.method === 'POST' ? Promise.resolve(json(after)) : pending.promise,
    );
    vi.stubGlobal('fetch', fetcher);
    const { result } = renderHook(
      () => ({ query: useStudySession(study.id), command: useStudyAction(study.id) }),
      { wrapper },
    );
    await waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
    await act(() =>
      result.current.command.mutateAsync({ action: 'known', cardId: 'card', version: 0 }),
    );
    await act(async () => {
      pending.resolve(json(study));
      await pending.promise;
    });
    await waitFor(() => expect(result.current.query.isFetching).toBe(false));
    expect(result.current.query.data?.version).toBe(1);
  });

  it('does not let a delayed flashcard mutation roll back newer session and active caches', async () => {
    const { client, wrapper } = context(),
      pending = deferred();
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockReturnValueOnce(pending.promise)
        .mockResolvedValue(json({ ...study, version: 2 })),
    );
    const { result } = renderHook(
      () => ({ first: useStudyAction(study.id), second: useStudyAction(study.id) }),
      { wrapper },
    );
    let first!: ReturnType<typeof result.current.first.mutateAsync>;
    act(() => {
      first = result.current.first.mutateAsync({ action: 'known', cardId: 'card', version: 0 });
    });
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    await act(() =>
      result.current.second.mutateAsync({ action: 'known', cardId: 'card', version: 1 }),
    );
    await act(async () => {
      pending.resolve(json({ ...study, version: 1 }));
      await first;
    });
    expect(client.getQueryData<StudySession>(studyKeys.session(study.id))?.version).toBe(2);
    expect(client.getQueryData<StudySession>(studyKeys.active('list'))?.version).toBe(2);
  });
});
