import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, isRecord, request } from './api';
import { listKeys } from './lists';

export interface Word {
  id: string;
  english: string;
  meanings: { id: string; turkish: string; position: number }[];
}
export interface WordInput {
  english: string;
  meanings: string[];
}
export interface SimilarityDecision {
  id: string;
  action: 'skip' | 'keep';
}
export type Submission = ({ kind: 'single'; entry: WordInput } | { kind: 'bulk'; text: string }) & {
  decisions?: SimilarityDecision[];
};
export interface Preview {
  token: string;
  canCommit: boolean;
  unresolvedDecisions: number;
  rows: {
    line: number;
    english: string;
    existingWordId: string | null;
    status: string;
    meanings: {
      turkish: string;
      status: string;
      similarity?: { id: string; existing: string; action: 'skip' | 'keep' | null };
    }[];
    warnings: string[];
  }[];
  invalid: { line: number; codes: string[] }[];
  counts: {
    newWords: number;
    mergedWords: number;
    newMeanings: number;
    skippedMeanings: number;
    duplicateEntries: number;
  };
}
export interface CommitResult extends Preview {
  changed: boolean;
}
const base = (id: string) => `/lists/${encodeURIComponent(id)}/words`;
const stringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item: unknown) => typeof item === 'string');
function isWord(value: unknown): value is Word {
  return (
    isRecord(value) &&
    typeof value['id'] === 'string' &&
    typeof value['english'] === 'string' &&
    Array.isArray(value['meanings']) &&
    value['meanings'].length > 0 &&
    value['meanings'].every(
      (meaning: unknown) =>
        isRecord(meaning) &&
        typeof meaning['id'] === 'string' &&
        typeof meaning['turkish'] === 'string' &&
        Number.isInteger(meaning['position']),
    )
  );
}
function previewResult(value: unknown): Preview {
  const validCounts = isRecord(value) && isRecord(value['counts']) ? value['counts'] : undefined;
  if (
    !isRecord(value) ||
    typeof value['token'] !== 'string' ||
    typeof value['canCommit'] !== 'boolean' ||
    !Number.isInteger(value['unresolvedDecisions']) ||
    (value['unresolvedDecisions'] as number) < 0 ||
    !Array.isArray(value['rows']) ||
    !value['rows'].every(
      (row: unknown) =>
        isRecord(row) &&
        Number.isInteger(row['line']) &&
        typeof row['english'] === 'string' &&
        typeof row['status'] === 'string' &&
        (row['existingWordId'] === null || typeof row['existingWordId'] === 'string') &&
        stringArray(row['warnings']) &&
        Array.isArray(row['meanings']) &&
        row['meanings'].every(
          (meaning: unknown) =>
            isRecord(meaning) &&
            typeof meaning['turkish'] === 'string' &&
            typeof meaning['status'] === 'string' &&
            (meaning['similarity'] === undefined ||
              (isRecord(meaning['similarity']) &&
                typeof meaning['similarity']['id'] === 'string' &&
                typeof meaning['similarity']['existing'] === 'string' &&
                [null, 'skip', 'keep'].includes(meaning['similarity']['action'] as string | null))),
        ),
    ) ||
    !Array.isArray(value['invalid']) ||
    !value['invalid'].every(
      (row: unknown) => isRecord(row) && Number.isInteger(row['line']) && stringArray(row['codes']),
    ) ||
    !validCounts ||
    !['newWords', 'mergedWords', 'newMeanings', 'skippedMeanings', 'duplicateEntries'].every(
      (key) => Number.isInteger(validCounts[key]) && (validCounts[key] as number) >= 0,
    )
  )
    throw new ApiError('Invalid API response', 200);
  return value as unknown as Preview;
}
export const wordsApi = {
  async all(listId: string, signal?: AbortSignal): Promise<Word[]> {
    const result = await request(base(listId), 'GET', undefined, signal);
    if (!isRecord(result) || !Array.isArray(result['words']) || !result['words'].every(isWord))
      throw new ApiError('Invalid API response', 200);
    return result['words'];
  },
  async preview(listId: string, submission: Submission) {
    return previewResult(await request(`${base(listId)}/preview`, 'POST', submission));
  },
  async commit(listId: string, submission: Submission, token: string): Promise<CommitResult> {
    const result = await request(`${base(listId)}/commit`, 'POST', { submission, token });
    const preview = previewResult(result);
    if (!isRecord(result) || typeof result['changed'] !== 'boolean')
      throw new ApiError('Invalid API response', 200);
    return { ...preview, changed: result['changed'] };
  },
  async edit(listId: string, wordId: string, input: WordInput) {
    const result = await request(`${base(listId)}/${encodeURIComponent(wordId)}`, 'PATCH', input);
    if (!isRecord(result) || !isWord(result['word']) || typeof result['changed'] !== 'boolean')
      throw new ApiError('Invalid API response', 200);
    return { word: result['word'], changed: result['changed'] };
  },
  remove: (listId: string, wordId: string) =>
    request(`${base(listId)}/${encodeURIComponent(wordId)}`, 'DELETE'),
};
export const wordKeys = { list: (listId: string) => ['words', listId] as const };
export function useWords(listId: string) {
  return useQuery({
    queryKey: wordKeys.list(listId),
    queryFn: ({ signal }) => wordsApi.all(listId, signal),
  });
}
export function useWordMutation<T, R>(listId: string, mutationFn: (value: T) => Promise<R>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: wordKeys.list(listId) }),
        client.invalidateQueries({ queryKey: listKeys.all }),
      ]);
    },
  });
}

/** Immediate form feedback; the authoritative normalization and merge engine lives on the API. */
export function validateWord(input: WordInput, editing = false): string | undefined {
  const normalized = (value: string) => value.trim().normalize('NFC').replace(/\s+/gu, ' ');
  const word = normalized(input.english);
  if (!word) return 'WORD_REQUIRED';
  if ([...word].length > 120) return 'WORD_TOO_LONG';
  const meanings = input.meanings.map(normalized);
  if (!meanings.length || meanings.some((value) => !value)) return 'MEANING_REQUIRED';
  if (meanings.some((value) => [...value].length > 160)) return 'MEANING_TOO_LONG';
  if (
    editing &&
    new Set(meanings.map((value) => value.toLocaleLowerCase('tr-TR'))).size !== meanings.length
  )
    return 'MEANING_ALREADY_EXISTS';
  return undefined;
}
