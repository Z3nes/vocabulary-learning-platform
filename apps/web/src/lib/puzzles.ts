import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, isRecord, request } from './api';
import type { StudyPercentage } from './study';

export const puzzleNames = { 'word-search': 'Kelime Avı', crossword: 'Çapraz Bulmaca' } as const;
export type PuzzleType = keyof typeof puzzleNames;
export interface PuzzleEntry {
  id: string;
  meanings: string[];
  length: number;
  segments: number[];
  number: number;
  solved: boolean;
  attempts: number;
  english?: string;
  row?: number;
  col?: number;
  dr?: number;
  dc?: number;
}
export interface PuzzleBoard {
  rows: number;
  cols: number;
  grid: (string | null)[];
  draft: string[];
  entries: PuzzleEntry[];
}
export interface OmittedWord {
  id: string;
  english?: string;
  meanings: string[];
  reason: 'unsupported' | 'length' | 'ambiguous' | 'layout';
}
export interface PuzzleSession {
  id: string;
  listId: string | null;
  listTitle: string;
  gameType: PuzzleType;
  percentage: StudyPercentage;
  eligibleCount: number;
  selectedCount: number;
  placedCount: number;
  version: number;
  status: 'ACTIVE' | 'COMPLETED' | 'CANCELED';
  createdAt: string;
  completedAt: string | null;
  canceledAt: string | null;
  omitted: OmittedWord[];
  boards: PuzzleBoard[];
  unplaced: { id: string; english: string; meanings: string[] }[];
}
const count = (v: unknown): v is number => Number.isSafeInteger(v) && Number(v) >= 0;
const texts = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((s) => typeof s === 'string');
function isOmitted(w: unknown): w is OmittedWord {
  return (
    isRecord(w) &&
    typeof w['id'] === 'string' &&
    texts(w['meanings']) &&
    (w['english'] === undefined || typeof w['english'] === 'string') &&
    ['unsupported', 'length', 'ambiguous', 'layout'].includes(String(w['reason']))
  );
}
export function isPuzzleSession(s: unknown): s is PuzzleSession {
  if (
    !isRecord(s) ||
    typeof s['id'] !== 'string' ||
    typeof s['listTitle'] !== 'string' ||
    !(s['listId'] === null || typeof s['listId'] === 'string') ||
    !Object.hasOwn(puzzleNames, String(s['gameType'])) ||
    ![15, 25, 50, 100].includes(Number(s['percentage'])) ||
    !['ACTIVE', 'COMPLETED', 'CANCELED'].includes(String(s['status'])) ||
    !['eligibleCount', 'selectedCount', 'placedCount', 'version'].every((k) => count(s[k])) ||
    Number(s['placedCount']) < 1 ||
    Number(s['selectedCount']) < Number(s['placedCount']) ||
    Number(s['eligibleCount']) < Number(s['selectedCount']) ||
    typeof s['createdAt'] !== 'string' ||
    !Number.isFinite(Date.parse(s['createdAt'])) ||
    !['completedAt', 'canceledAt'].every(
      (k) => s[k] === null || (typeof s[k] === 'string' && Number.isFinite(Date.parse(s[k]))),
    ) ||
    !Array.isArray(s['omitted']) ||
    !s['omitted'].every(isOmitted) ||
    !Array.isArray(s['boards']) ||
    !s['boards'].length ||
    !Array.isArray(s['unplaced']) ||
    !s['unplaced'].every(
      (w: unknown) =>
        isRecord(w) &&
        typeof w['id'] === 'string' &&
        typeof w['english'] === 'string' &&
        texts(w['meanings']),
    ) ||
    (s['status'] !== 'COMPLETED' && s['unplaced'].length > 0)
  )
    return false;
  return s['boards'].every(
    (b: unknown) =>
      isRecord(b) &&
      count(b['rows']) &&
      b['rows'] > 0 &&
      b['rows'] <= 20 &&
      count(b['cols']) &&
      b['cols'] > 0 &&
      b['cols'] <= 20 &&
      Array.isArray(b['grid']) &&
      b['grid'].length === b['rows'] * b['cols'] &&
      b['grid'].every(
        (v: unknown) => v === null || (typeof v === 'string' && /^[A-Z]?$/.test(v)),
      ) &&
      texts(b['draft']) &&
      b['draft'].length === b['grid'].length &&
      b['draft'].every((v) => /^[A-Z]?$/.test(v)) &&
      Array.isArray(b['entries']) &&
      b['entries'].length > 0 &&
      b['entries'].every(
        (e: unknown) =>
          isRecord(e) &&
          typeof e['id'] === 'string' &&
          texts(e['meanings']) &&
          e['meanings'].length > 0 &&
          count(e['length']) &&
          e['length'] >= 2 &&
          e['length'] <= 18 &&
          count(e['number']) &&
          count(e['attempts']) &&
          typeof e['solved'] === 'boolean' &&
          Array.isArray(e['segments']) &&
          e['segments'].every((n: unknown) => count(n) && n > 0) &&
          e['segments'].reduce((sum: number, n: unknown) => sum + Number(n), 0) === e['length'] &&
          (e['solved'] ? typeof e['english'] === 'string' : e['english'] === undefined) &&
          ((s['gameType'] === 'word-search' && !e['solved']) ||
            (count(e['row']) &&
              count(e['col']) &&
              e['row'] < Number(b['rows']) &&
              e['col'] < Number(b['cols']) &&
              typeof e['dr'] === 'number' &&
              [-1, 0, 1].includes(e['dr']) &&
              typeof e['dc'] === 'number' &&
              [-1, 0, 1].includes(e['dc']))),
      ),
  );
}
function sessionOf(value: unknown) {
  if (!isRecord(value) || !isPuzzleSession(value['session']))
    throw new ApiError('Invalid API response', 200);
  return value['session'];
}
export function usePuzzleSetup(listId: string, type: PuzzleType) {
  return useQuery({
    queryKey: ['puzzles', 'setup', listId, type],
    enabled: !!listId,
    staleTime: 0,
    queryFn: async ({ signal }) => {
      const value = await request(
        `/lists/${encodeURIComponent(listId)}/puzzles?gameType=${type}`,
        'GET',
        undefined,
        signal,
      );
      if (
        !isRecord(value) ||
        !count(value['eligibleCount']) ||
        !Array.isArray(value['omitted']) ||
        !value['omitted'].every(isOmitted)
      )
        throw new ApiError('Invalid API response', 200);
      return {
        eligibleCount: value['eligibleCount'],
        omitted: value['omitted'],
        session: value['session'] === null ? null : sessionOf(value),
      };
    },
  });
}
export function useActivePuzzles(type: PuzzleType) {
  return useQuery({
    queryKey: ['puzzles', 'setup', 'all', type],
    staleTime: 0,
    queryFn: async ({ signal }) => {
      const value = await request(`/puzzles/active?gameType=${type}`, 'GET', undefined, signal);
      if (!isRecord(value) || !Array.isArray(value['sessions']))
        throw new ApiError('Invalid API response', 200);
      return value['sessions'].map((s: unknown) => {
        if (
          !isRecord(s) ||
          typeof s['id'] !== 'string' ||
          typeof s['listTitle'] !== 'string' ||
          !count(s['placedCount'])
        )
          throw new ApiError('Invalid API response', 200);
        return { id: s['id'], listTitle: s['listTitle'], placedCount: s['placedCount'] };
      });
    },
  });
}
export function usePuzzle(id: string) {
  const client = useQueryClient();
  return useQuery({
    queryKey: ['puzzles', 'session', id],
    staleTime: 0,
    queryFn: async ({ signal }) => {
      const session = sessionOf(
        await request(`/puzzles/${encodeURIComponent(id)}`, 'GET', undefined, signal),
      );
      const saved = client.getQueryData<PuzzleSession>(['puzzles', 'session', id]);
      return saved && saved.version > session.version ? saved : session;
    },
  });
}
export function useStartPuzzle(listId: string, type: PuzzleType) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (percentage: StudyPercentage) =>
      sessionOf(
        await request(`/lists/${encodeURIComponent(listId)}/puzzles`, 'POST', {
          percentage,
          gameType: type,
        }),
      ),
    onSuccess: (s) => {
      client.setQueryData(['puzzles', 'session', s.id], s);
    },
    onSettled: () => {
      void client.invalidateQueries({ queryKey: ['puzzles', 'setup', listId, type] });
    },
  });
}
export type PuzzleMove = { commandId: string; version: number; board: number } & (
  | { action: 'select'; start: number; end: number }
  | { action: 'draft'; values: string[] }
  | { action: 'check'; entryId: string }
);
export function usePuzzleCommand(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: PuzzleMove | { action: 'complete' | 'cancel' }) => {
      const { action } = input;
      const value = await request(
        `/puzzles/${encodeURIComponent(id)}/${action === 'complete' || action === 'cancel' ? action : 'moves'}`,
        'POST',
        action === 'complete' || action === 'cancel' ? {} : input,
      );
      return {
        session: sessionOf(value),
        correct: isRecord(value) && typeof value['correct'] === 'boolean' ? value['correct'] : null,
      };
    },
    onSuccess: ({ session }) => {
      client.setQueryData<PuzzleSession>(['puzzles', 'session', id], (old) =>
        old && old.version > session.version ? old : session,
      );
      void client.invalidateQueries({ queryKey: ['puzzles', 'setup'] });
      if (session.status === 'COMPLETED') void client.invalidateQueries({ queryKey: ['activity'] });
    },
    onError: (e) => {
      if (e instanceof ApiError && e.status === 409)
        void client.invalidateQueries({ queryKey: ['puzzles', 'session', id] });
    },
  });
}
export function entryCells(e: PuzzleEntry, cols: number): number[] {
  if (e.row === undefined || e.col === undefined || e.dr === undefined || e.dc === undefined)
    return [];
  return Array.from(
    { length: e.length },
    (_, i) => (e.row! + e.dr! * i) * cols + e.col! + e.dc! * i,
  );
}
