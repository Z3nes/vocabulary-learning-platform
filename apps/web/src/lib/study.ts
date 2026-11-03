import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { ApiError, isRecord, request } from './api';
import { listKeys } from './lists';

// Client for the Session 5A study API. The backend owns every study rule (word
// selection, queue order, outcomes, review priority, completion, concurrency); this
// module only transports and validates its responses. Nothing here decides an outcome.

export const studyPercentages = [15, 25, 50, 100] as const;
export type StudyPercentage = (typeof studyPercentages)[number];
export type StudyDirection = 'en-tr' | 'tr-en';
export type StudyAction = 'known' | 'missed' | 'skip' | 'remove';
export type StudyOutcome = 'known' | 'missed' | 'removed';
export type StudyStatus = 'active' | 'completed' | 'ended_early';

export interface StudyCounts {
  total: number;
  known: number;
  missed: number;
  removed: number;
  /** Not yet resolved, including skipped cards waiting for their second appearance. */
  unanswered: number;
}
export interface CurrentCard {
  originListId?: string | null;
  originListTitle?: string | null;
  id: string;
  /** 1 on the first appearance, 2 after one skip (Çıkar replaces Atla). */
  appearance: 1 | 2;
  /** Prompt side; EN→TR: the English text, TR→EN: every Turkish meaning. */
  front: string[];
  /** Answer side. */
  back: string[];
  /** In fixed display order: Bildim | Atla/Çıkar | Bilemedim. */
  allowedActions: StudyAction[];
}
export interface StudyCard {
  id: string;
  /** Null when the word was deleted after the session started; the snapshot remains. */
  wordId: string | null;
  english: string;
  meanings: string[];
  position: number;
  skipped: boolean;
  outcome: StudyOutcome | null;
  answeredAt: string | null;
}
export interface StudySession {
  id: string;
  listId: string | null;
  reviewOnly?: boolean;
  listTitle: string;
  direction: StudyDirection;
  percentage: StudyPercentage;
  status: StudyStatus;
  version: number;
  startedAt: string;
  finishedAt: string | null;
  counts: StudyCounts;
  currentCard: CurrentCard | null;
  cards: StudyCard[];
}
export interface ActionInput {
  cardId: string;
  /** The session version the action was chosen on. */
  version: number;
  action: StudyAction;
}
export interface MutationResult {
  session: StudySession;
  /** False when the server had already applied this exact request (a replay). */
  applied: boolean;
}

/** Same rule as the backend: rounded up, never more than the list. */
export function estimatedCardCount(total: number, percentage: StudyPercentage): number {
  return Math.min(total, Math.ceil((total * percentage) / 100));
}
export const directionLabels: Record<StudyDirection, string> = {
  'en-tr': 'İngilizce → Türkçe',
  'tr-en': 'Türkçe → İngilizce',
};
/** Cards with a final outcome (Bildim, Bilemedim or Çıkarılan). */
export const resolvedCount = (counts: StudyCounts) => counts.known + counts.missed + counts.removed;

const actions: readonly string[] = ['known', 'missed', 'skip', 'remove'];
const outcomes: readonly (string | null)[] = ['known', 'missed', 'removed', null];
const statuses: readonly string[] = ['active', 'completed', 'ended_early'];
const strings = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item: unknown) => typeof item === 'string');
const count = (value: unknown) => Number.isInteger(value) && (value as number) >= 0;
const date = (value: unknown) => typeof value === 'string' && Number.isFinite(Date.parse(value));

function isCard(value: unknown): value is StudyCard {
  return (
    isRecord(value) &&
    typeof value['id'] === 'string' &&
    (value['wordId'] === null || typeof value['wordId'] === 'string') &&
    typeof value['english'] === 'string' &&
    strings(value['meanings']) &&
    value['meanings'].length > 0 &&
    count(value['position']) &&
    typeof value['skipped'] === 'boolean' &&
    outcomes.includes(value['outcome'] as string | null) &&
    (value['answeredAt'] === null || date(value['answeredAt']))
  );
}
function isCurrentCard(value: unknown): value is CurrentCard {
  return (
    isRecord(value) &&
    typeof value['id'] === 'string' &&
    (value['appearance'] === 1 || value['appearance'] === 2) &&
    strings(value['front']) &&
    value['front'].length > 0 &&
    strings(value['back']) &&
    value['back'].length > 0 &&
    Array.isArray(value['allowedActions']) &&
    value['allowedActions'].length === 3 &&
    value['allowedActions'].every((action: unknown) => actions.includes(action as string))
  );
}
export function isStudySession(value: unknown): value is StudySession {
  if (!isRecord(value)) return false;
  const counts = value['counts'];
  const cards = value['cards'];
  const current = value['currentCard'];
  return (
    typeof value['id'] === 'string' &&
    (typeof value['listId'] === 'string' || value['listId'] === null) &&
    typeof value['listTitle'] === 'string' &&
    (value['direction'] === 'en-tr' || value['direction'] === 'tr-en') &&
    studyPercentages.includes(value['percentage'] as StudyPercentage) &&
    statuses.includes(value['status'] as string) &&
    count(value['version']) &&
    date(value['startedAt']) &&
    (value['finishedAt'] === null || date(value['finishedAt'])) &&
    isRecord(counts) &&
    ['total', 'known', 'missed', 'removed', 'unanswered'].every((key) => count(counts[key])) &&
    Array.isArray(cards) &&
    cards.every(isCard) &&
    cards.length === counts['total'] &&
    // An active session always has a current card; a finished one never has.
    (value['status'] === 'active'
      ? isCurrentCard(current) && cards.some((card) => card.id === current.id)
      : current === null)
  );
}

const invalid = () => new ApiError('Invalid API response', 200);
function sessionOf(result: unknown): StudySession {
  if (!isRecord(result) || !isStudySession(result['session'])) throw invalid();
  return result['session'];
}
function mutationOf(result: unknown): MutationResult {
  const session = sessionOf(result);
  if (!isRecord(result) || typeof result['applied'] !== 'boolean') throw invalid();
  return { session, applied: result['applied'] };
}
const listBase = (listId: string) => `/lists/${encodeURIComponent(listId)}/study-sessions`;
const sessionBase = (sessionId: string) => `/study-sessions/${encodeURIComponent(sessionId)}`;

export const studyApi = {
  async active(listId: string, signal?: AbortSignal): Promise<StudySession | null> {
    const result = await request(`${listBase(listId)}/active`, 'GET', undefined, signal);
    if (isRecord(result) && result['session'] === null) return null;
    return sessionOf(result);
  },
  async start(
    listId: string,
    options: { percentage: StudyPercentage; direction: StudyDirection },
  ): Promise<StudySession> {
    return sessionOf(await request(listBase(listId), 'POST', options));
  },
  async one(sessionId: string, signal?: AbortSignal): Promise<StudySession> {
    return sessionOf(await request(sessionBase(sessionId), 'GET', undefined, signal));
  },
  async act(sessionId: string, input: ActionInput): Promise<MutationResult> {
    return mutationOf(await request(`${sessionBase(sessionId)}/actions`, 'POST', input));
  },
  async end(sessionId: string): Promise<MutationResult> {
    return mutationOf(await request(`${sessionBase(sessionId)}/end`, 'POST', {}));
  },
};

export const studyKeys = {
  all: ['study'] as const,
  active: (listId: string | null) => ['study', 'active', listId] as const,
  session: (sessionId: string) => ['study', 'session', sessionId] as const,
};

/** Codes meaning "the session changed elsewhere": reload it instead of guessing. */
const outdatedCodes = new Set([
  'STUDY_SESSION_STALE',
  'STUDY_CARD_ALREADY_ANSWERED',
  'STUDY_SESSION_FINISHED',
  'STUDY_ACTION_NOT_ALLOWED',
  'STUDY_CARD_NOT_FOUND',
]);
export const isOutdatedError = (error: unknown) =>
  error instanceof ApiError && outdatedCodes.has(error.code);

/** Stores a server session as the single source for both its own and its list's query. */
export async function storeStudySession(client: QueryClient, session: StudySession) {
  const saved = client.getQueryData<StudySession>(studyKeys.session(session.id));
  if (saved && saved.version > session.version) return;
  client.setQueryData(studyKeys.session(session.id), session);
  client.setQueryData(
    session.reviewOnly
      ? ['study', 'review-active', session.listId]
      : studyKeys.active(session.listId),
    (old: StudySession | null | undefined) =>
      old && old.id !== session.id && session.status !== 'active'
        ? old
        : session.status === 'active'
          ? session
          : null,
  );
  // Evaluations can change review priority before the session ends. Terminal
  // sessions also add history; refresh mounted panels and invalidate cached ones.
  await Promise.all([
    client.invalidateQueries({ queryKey: ['review'] }),
    ...(session.status === 'active' ? [] : [client.invalidateQueries({ queryKey: ['activity'] })]),
  ]);
}

// Study state can change in another tab or device, so these queries are always
// considered stale: every mount and window focus reloads the server state.
export function useActiveSession(listId: string | null, reviewOnly = false) {
  const client = useQueryClient();
  return useQuery({
    queryKey: reviewOnly ? ['study', 'review-active', listId] : studyKeys.active(listId),
    queryFn: async ({ signal }) => {
      const result =
        !reviewOnly && listId
          ? { session: await studyApi.active(listId, signal) }
          : await request(
              `/review/study-sessions/active${listId ? `?listId=${encodeURIComponent(listId)}` : ''}`,
              'GET',
              undefined,
              signal,
            );
      if (isRecord(result) && result['session'] === null) return null;
      const session = sessionOf(result);
      const saved = client.getQueryData<StudySession>(studyKeys.session(session.id));
      const latest = saved && saved.version > session.version ? saved : session;
      return latest.status === 'active' ? latest : null;
    },
    staleTime: 0,
  });
}
export function useStudySession(sessionId: string) {
  const client = useQueryClient();
  return useQuery({
    queryKey: studyKeys.session(sessionId),
    queryFn: async ({ signal }) => {
      const session = await studyApi.one(sessionId, signal);
      const saved = client.getQueryData<StudySession>(studyKeys.session(sessionId));
      return saved && saved.version > session.version ? saved : session;
    },
    staleTime: 0,
  });
}
export function useStartSession(listId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (options: { percentage: StudyPercentage; direction: StudyDirection }) =>
      studyApi.start(listId, options),
    onSuccess: (session) => storeStudySession(client, session),
    onError: async (error) => {
      // Another device may have started a session, or emptied the list, meanwhile.
      if (error instanceof ApiError && error.code === 'STUDY_SESSION_ACTIVE')
        await client.invalidateQueries({ queryKey: studyKeys.active(listId) });
      if (error instanceof ApiError && error.code === 'STUDY_LIST_EMPTY')
        await client.invalidateQueries({ queryKey: listKeys.all });
    },
  });
}
export function useStudyAction(sessionId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: ActionInput) => studyApi.act(sessionId, input),
    onSuccess: ({ session }) => storeStudySession(client, session),
    onError: async (error) => {
      if (isOutdatedError(error))
        await client.invalidateQueries({ queryKey: studyKeys.session(sessionId) });
    },
  });
}
export function useEndSession(sessionId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => studyApi.end(sessionId),
    onSuccess: ({ session }) => storeStudySession(client, session),
    onError: async (error) => {
      if (isOutdatedError(error))
        await client.invalidateQueries({ queryKey: studyKeys.session(sessionId) });
    },
  });
}
