import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, isRecord, request } from './api';
import type { StudyPercentage } from './study';
export const practiceNames = {
  'written-recall': 'Yazılı Cevap',
  listening: 'Dinle ve Yaz',
  mixed: 'Karma Çalışma',
} as const;
export const mixedActivityNames = {
  flashcard: 'Kelime kartı',
  'written-recall': 'Yazılı Cevap',
  listening: 'Dinle ve Yaz',
  choice: 'Seçenekli tanıma',
} as const;
export type MixedActivity = keyof typeof mixedActivityNames;
export type PracticeType = keyof typeof practiceNames;

export interface PracticeEvaluation {
  answer: string;
  english: string;
  correct: boolean | null;
  masteryEligible: boolean;
  masteryApplied: boolean;
  feedback: 'target' | 'alternative' | 'overlap' | 'incorrect' | 'self' | 'choice';
}
export interface PracticeQuestion {
  id: string;
  position: number;
  meanings: string[];
  evaluation: PracticeEvaluation | null;
  resolution?: 'answered' | 'audio_unavailable' | null;
  activityType?: MixedActivity;
  originListId?: string;
  originListTitle?: string;
  revealed?: boolean;
  prompt?: string;
  options?: { id: string; meanings: string[] }[];
  correctOptionId?: string;
}
export interface PracticeSession {
  id: string;
  listId: string | null;
  listTitle: string;
  practiceType: PracticeType;
  percentage: StudyPercentage;
  eligibleCount: number;
  questionCount: number;
  currentPosition: number;
  version: number;
  status: 'ACTIVE' | 'COMPLETED' | 'CANCELED';
  createdAt: string;
  completedAt: string | null;
  canceledAt: string | null;
  currentQuestion: PracticeQuestion | null;
  results: PracticeQuestion[];
  correctCount: number;
  incorrectCount?: number;
  skippedCount?: number;
  masteryEligibleCount: number;
  masteryAppliedCount: number;
  selfKnownCount?: number;
  selfMissedCount?: number;
  distribution?: {
    activityType: MixedActivity;
    total: number;
    correct: number;
    incorrect: number;
    skipped: number;
  }[];
}
const count = (n: unknown) => Number.isSafeInteger(n) && Number(n) >= 0;
function isQuestion(q: unknown): q is PracticeQuestion {
  if (
    !isRecord(q) ||
    typeof q['id'] !== 'string' ||
    !count(q['position']) ||
    !Array.isArray(q['meanings']) ||
    (!q['meanings'].length && !['flashcard', 'choice'].includes(String(q['activityType']))) ||
    !q['meanings'].every((m: unknown) => typeof m === 'string') ||
    !(
      q['resolution'] === undefined ||
      q['resolution'] === null ||
      (typeof q['resolution'] === 'string' &&
        ['answered', 'audio_unavailable'].includes(q['resolution']))
    )
  )
    return false;
  const e = q['evaluation'];
  if (q['activityType'] !== undefined) {
    if (
      typeof q['activityType'] !== 'string' ||
      !Object.hasOwn(mixedActivityNames, q['activityType']) ||
      typeof q['originListId'] !== 'string' ||
      typeof q['originListTitle'] !== 'string' ||
      typeof q['revealed'] !== 'boolean'
    )
      return false;
    if (['flashcard', 'choice'].includes(q['activityType']) && typeof q['prompt'] !== 'string')
      return false;
    if (
      q['activityType'] === 'choice' &&
      (!Array.isArray(q['options']) ||
        q['options'].length !== 4 ||
        !q['options'].every(
          (o: unknown) =>
            isRecord(o) &&
            typeof o['id'] === 'string' &&
            Array.isArray(o['meanings']) &&
            o['meanings'].length > 0 &&
            o['meanings'].every((m: unknown) => typeof m === 'string'),
        ))
    )
      return false;
    if (
      q['correctOptionId'] !== undefined &&
      (typeof q['correctOptionId'] !== 'string' || e === null)
    )
      return false;
  }
  return (
    e === null ||
    (isRecord(e) &&
      typeof e['answer'] === 'string' &&
      typeof e['english'] === 'string' &&
      (typeof e['correct'] === 'boolean' ||
        (q['activityType'] === 'flashcard' && e['correct'] === null)) &&
      ['masteryEligible', 'masteryApplied'].every((k) => typeof e[k] === 'boolean') &&
      ['target', 'alternative', 'overlap', 'incorrect', 'self', 'choice'].includes(
        String(e['feedback']),
      ))
  );
}
export function isPracticeSession(s: unknown): s is PracticeSession {
  return (
    isRecord(s) &&
    typeof s['id'] === 'string' &&
    typeof s['listTitle'] === 'string' &&
    (s['listId'] === null || typeof s['listId'] === 'string') &&
    Object.hasOwn(practiceNames, String(s['practiceType'])) &&
    (s['practiceType'] !== 'mixed' ||
      (count(s['selfKnownCount']) &&
        count(s['selfMissedCount']) &&
        Array.isArray(s['distribution']) &&
        s['distribution'].length === 4 &&
        s['distribution'].every(
          (d: unknown) =>
            isRecord(d) &&
            typeof d['activityType'] === 'string' &&
            Object.hasOwn(mixedActivityNames, d['activityType']) &&
            ['total', 'correct', 'incorrect', 'skipped'].every((k) => count(d[k])),
        ))) &&
    ['incorrectCount', 'skippedCount'].every((key) => s[key] === undefined || count(s[key])) &&
    [15, 25, 50, 100].includes(Number(s['percentage'])) &&
    ['ACTIVE', 'COMPLETED', 'CANCELED'].includes(String(s['status'])) &&
    [
      'eligibleCount',
      'questionCount',
      'currentPosition',
      'version',
      'correctCount',
      'masteryEligibleCount',
      'masteryAppliedCount',
    ].every((k) => count(s[k])) &&
    Number(s['questionCount']) > 0 &&
    Number(s['currentPosition']) <= Number(s['questionCount']) &&
    typeof s['createdAt'] === 'string' &&
    Number.isFinite(Date.parse(s['createdAt'])) &&
    ['completedAt', 'canceledAt'].every(
      (k) => s[k] === null || (typeof s[k] === 'string' && Number.isFinite(Date.parse(s[k]))),
    ) &&
    (s['currentQuestion'] === null || isQuestion(s['currentQuestion'])) &&
    Array.isArray(s['results']) &&
    s['results'].every(isQuestion)
  );
}
function sessionOf(value: unknown): PracticeSession {
  if (!isRecord(value) || !isPracticeSession(value['session']))
    throw new ApiError('Invalid API response', 200);
  return value['session'];
}
export const practiceKeys = {
  all: ['practice'] as const,
  active: (listId: string, type: PracticeType = 'written-recall') =>
    ['practice', 'active', listId, type] as const,
  session: (id: string) => ['practice', 'session', id] as const,
};
export function useActivePractice(listId: string, type: PracticeType = 'written-recall') {
  const client = useQueryClient();
  return useQuery({
    queryKey: practiceKeys.active(listId, type),
    staleTime: 0,
    queryFn: async ({ signal }) => {
      const value = await request(
        `/lists/${encodeURIComponent(listId)}/practice/active${type === 'listening' ? '?practiceType=listening' : ''}`,
        'GET',
        undefined,
        signal,
      );
      if (isRecord(value) && value['session'] === null) return null;
      const session = sessionOf(value);
      const saved = client.getQueryData<PracticeSession>(practiceKeys.session(session.id));
      const latest = saved && saved.version > session.version ? saved : session;
      return latest.status === 'ACTIVE' ? latest : null;
    },
  });
}
export function usePractice(id: string) {
  const client = useQueryClient();
  return useQuery({
    queryKey: practiceKeys.session(id),
    staleTime: 0,
    queryFn: async ({ signal }) => {
      const session = sessionOf(
        await request(`/practice/${encodeURIComponent(id)}`, 'GET', undefined, signal),
      );
      const saved = client.getQueryData<PracticeSession>(practiceKeys.session(id));
      return saved && saved.version > session.version ? saved : session;
    },
  });
}
export type PracticeCommand =
  | { action: 'answers'; questionId: string; version: number; answer: string }
  | { action: 'next'; questionId: string; version: number }
  | { action: 'skip-audio'; questionId: string; version: number }
  | { action: 'reveal'; questionId: string; version: number }
  | {
      action: 'self-evaluation';
      questionId: string;
      version: number;
      evaluation: 'known' | 'missed';
    }
  | { action: 'choice'; questionId: string; version: number; optionId: string }
  | { action: 'complete' | 'cancel' };
export function usePracticeCommand(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ action, ...body }: PracticeCommand) =>
      sessionOf(await request(`/practice/${encodeURIComponent(id)}/${action}`, 'POST', body)),
    onSuccess: async (session) => {
      const saved = client.getQueryData<PracticeSession>(practiceKeys.session(id));
      if (saved && saved.version > session.version) return;
      client.setQueryData(practiceKeys.session(id), session);
      if (session.listId)
        client.setQueryData(
          practiceKeys.active(session.listId, session.practiceType),
          (old: PracticeSession | null | undefined) =>
            old && old.id !== session.id ? old : session.status === 'ACTIVE' ? session : null,
        );
      if (session.status === 'COMPLETED')
        await Promise.all([
          client.invalidateQueries({ queryKey: ['activity'] }),
          client.invalidateQueries({ queryKey: ['review'] }),
        ]);
      if (session.practiceType === 'mixed')
        await client.invalidateQueries({ queryKey: ['mixed-setup'] });
    },
    onError: async (error) => {
      if (error instanceof ApiError && error.status === 409)
        await client.invalidateQueries({ queryKey: practiceKeys.session(id) });
    },
  });
}
export function useStartPractice(listId: string, type: PracticeType = 'written-recall') {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (percentage: StudyPercentage) =>
      sessionOf(
        await request(`/lists/${encodeURIComponent(listId)}/practice`, 'POST', {
          percentage,
          ...(type === 'listening' ? { practiceType: type } : {}),
        }),
      ),
    onSuccess: (s) => {
      client.setQueryData(practiceKeys.session(s.id), s);
      client.setQueryData(practiceKeys.active(listId, type), s);
    },
    onError: async () => {
      await client.invalidateQueries({ queryKey: practiceKeys.active(listId, type) });
    },
  });
}
