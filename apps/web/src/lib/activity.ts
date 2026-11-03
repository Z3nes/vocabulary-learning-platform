import { ApiError, isRecord, request } from './api';
import { historyGameNames, type GameItem } from './games';
export type HistoryGameItem = Omit<GameItem, 'outcome'> & {
  outcome: GameItem['outcome'] | 'audio_unavailable' | 'self_known' | 'self_missed';
  masteryEligible?: boolean;
  masteryApplied?: boolean;
  selectedCount?: number;
  placedCount?: number;
  puzzleSessionId?: string;
  activityType?: 'flashcard' | 'written-recall' | 'listening' | 'choice';
  originListTitle?: string;
  practiceSessionId?: string;
};

export interface HistorySession {
  id: string;
  listId: string | null;
  listTitle: string;
  direction: 'en-tr' | 'tr-en';
  percentage: number;
  status: 'completed' | 'ended_early';
  counts: { total: number; known: number; missed: number; removed: number; unanswered: number };
}
export interface HistoryGame {
  id: string;
  wordListId: string | null;
  listTitle: string;
  gameType: keyof typeof historyGameNames;
  items: HistoryGameItem[];
}
export type Activity = { key: string; at: string } & (
  { kind: 'flashcard'; session: HistorySession } | { kind: 'game'; game: HistoryGame }
);
const strings = (value: Record<string, unknown>, keys: string[]) =>
  keys.every((key) => typeof value[key] === 'string');
export function isGameItem(value: unknown): value is HistoryGameItem {
  return (
    isRecord(value) &&
    (value['wordId'] === null || typeof value['wordId'] === 'string') &&
    typeof value['english'] === 'string' &&
    Array.isArray(value['meanings']) &&
    value['meanings'].length > 0 &&
    value['meanings'].every((m: unknown) => typeof m === 'string') &&
    [
      'correct',
      'incorrect',
      'revealed',
      'matched',
      'audio_unavailable',
      'self_known',
      'self_missed',
    ].includes(String(value['outcome'])) &&
    Number.isInteger(value['attempts']) &&
    Number(value['attempts']) >= 0 &&
    ['selectedCount', 'placedCount'].every(
      (k) => value[k] === undefined || (Number.isSafeInteger(value[k]) && Number(value[k]) > 0),
    ) &&
    (value['puzzleSessionId'] === undefined || typeof value['puzzleSessionId'] === 'string') &&
    (value['practiceSessionId'] === undefined || typeof value['practiceSessionId'] === 'string') &&
    (value['originListTitle'] === undefined || typeof value['originListTitle'] === 'string') &&
    (value['activityType'] === undefined ||
      (typeof value['activityType'] === 'string' &&
        ['flashcard', 'written-recall', 'listening', 'choice'].includes(value['activityType'])))
  );
}
export function isActivity(value: unknown): value is Activity {
  if (
    !isRecord(value) ||
    !strings(value, ['key', 'at']) ||
    !Number.isFinite(Date.parse(String(value['at'])))
  )
    return false;
  if (value['kind'] === 'game') {
    const game = value['game'];
    return (
      isRecord(game) &&
      strings(game, ['id', 'listTitle']) &&
      (game['wordListId'] === null || typeof game['wordListId'] === 'string') &&
      Object.hasOwn(historyGameNames, String(game['gameType'])) &&
      Array.isArray(game['items']) &&
      game['items'].length > 0 &&
      (['written-recall', 'listening', 'word-search', 'crossword', 'mixed'].includes(
        String(game['gameType']),
      ) ||
        game['items'].length <= 10) &&
      game['items'].every(
        (item: unknown) =>
          isGameItem(item) &&
          (item.outcome !== 'audio_unavailable' ||
            ['listening', 'mixed'].includes(String(game['gameType']))) &&
          (!['self_known', 'self_missed'].includes(item.outcome) || game['gameType'] === 'mixed'),
      )
    );
  }
  if (value['kind'] !== 'flashcard') return false;
  const session = value['session'];
  if (
    !isRecord(session) ||
    !strings(session, ['id', 'listTitle']) ||
    !(session['listId'] === null || typeof session['listId'] === 'string') ||
    !['en-tr', 'tr-en'].includes(String(session['direction'])) ||
    ![15, 25, 50, 100].includes(Number(session['percentage'])) ||
    !['completed', 'ended_early'].includes(String(session['status'])) ||
    !isRecord(session['counts'])
  )
    return false;
  const counts = session['counts'];
  return (
    ['total', 'known', 'missed', 'removed', 'unanswered'].every(
      (key) => Number.isInteger(counts[key]) && Number(counts[key]) >= 0,
    ) &&
    counts['total'] ===
      Number(counts['known']) +
        Number(counts['missed']) +
        Number(counts['removed']) +
        Number(counts['unanswered'])
  );
}
export async function fetchActivity(signal?: AbortSignal): Promise<Activity[]> {
  const value = await request('/activity', 'GET', undefined, signal);
  if (
    !isRecord(value) ||
    !Array.isArray(value['activities']) ||
    value['activities'].length > 50 ||
    !value['activities'].every(isActivity)
  )
    throw new ApiError('Invalid API response', 200);
  return value['activities'];
}
