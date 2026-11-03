import { ApiError, isRecord, request } from './api';
export interface ReviewWord {
  wordId: string;
  english: string;
  meanings: string[];
  knownStreak: number;
  listId: string;
  listTitle: string;
  activeSessionId: string | null;
}
export interface ReviewPage {
  evaluatedCount: number;
  total: number;
  next: string | null;
  words: ReviewWord[];
}
export async function fetchReview(after: string | null, signal?: AbortSignal): Promise<ReviewPage> {
  const value = await request(
    `/review${after ? `?after=${encodeURIComponent(after)}` : ''}`,
    'GET',
    undefined,
    signal,
  );
  if (
    !isRecord(value) ||
    !Number.isInteger(value['evaluatedCount']) ||
    Number(value['evaluatedCount']) < 0 ||
    !Number.isInteger(value['total']) ||
    Number(value['total']) < 0 ||
    !(value['next'] === null || typeof value['next'] === 'string') ||
    !Array.isArray(value['words']) ||
    value['words'].length > 100 ||
    !value['words'].every(
      (word: unknown) =>
        isRecord(word) &&
        ['wordId', 'english', 'listId', 'listTitle'].every(
          (key) => typeof word[key] === 'string',
        ) &&
        [0, 1].includes(Number(word['knownStreak'])) &&
        Number.isInteger(word['knownStreak']) &&
        (word['activeSessionId'] === null || typeof word['activeSessionId'] === 'string') &&
        Array.isArray(word['meanings']) &&
        word['meanings'].length > 0 &&
        word['meanings'].every((m: unknown) => typeof m === 'string'),
    )
  )
    throw new ApiError('Invalid API response', 200);
  return value as unknown as ReviewPage;
}
