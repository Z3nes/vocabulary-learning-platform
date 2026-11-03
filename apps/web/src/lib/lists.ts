import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, isRecord, request } from './api';

export interface WordList {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  wordCount: number;
}

function isList(value: unknown): value is WordList {
  return (
    isRecord(value) &&
    ['id', 'title', 'createdAt', 'updatedAt'].every((key) => typeof value[key] === 'string') &&
    typeof value['createdAt'] === 'string' &&
    Number.isFinite(Date.parse(value['createdAt'])) &&
    typeof value['updatedAt'] === 'string' &&
    Number.isFinite(Date.parse(value['updatedAt'])) &&
    Number.isInteger(value['wordCount']) &&
    (value['wordCount'] as number) >= 0
  );
}

async function listResponse(promise: Promise<unknown>): Promise<WordList> {
  const value = await promise;
  if (!isRecord(value) || !isList(value['list'])) throw new ApiError('Invalid API response', 200);
  return value['list'];
}

export const listsApi = {
  async all(signal?: AbortSignal): Promise<WordList[]> {
    const result = await request('/lists', 'GET', undefined, signal);
    if (!isRecord(result) || !Array.isArray(result['lists']) || !result['lists'].every(isList)) {
      throw new ApiError('Invalid API response', 200);
    }
    return result['lists'];
  },
  one: (id: string, signal?: AbortSignal) =>
    listResponse(request(`/lists/${encodeURIComponent(id)}`, 'GET', undefined, signal)),
  create: (title: string) => listResponse(request('/lists', 'POST', { title })),
  rename: ({ id, title }: { id: string; title: string }) =>
    listResponse(request(`/lists/${encodeURIComponent(id)}`, 'PATCH', { title })),
  remove: (id: string) => request(`/lists/${encodeURIComponent(id)}`, 'DELETE'),
};

export const listKeys = { all: ['lists'] as const, detail: (id: string) => ['lists', id] as const };
export function useLists() {
  return useQuery({ queryKey: listKeys.all, queryFn: ({ signal }) => listsApi.all(signal) });
}
/**
 * One of the student's lists. When the overview (`useLists`) is already cached,
 * the entry with the same id is shown as placeholder data, so the page header
 * renders the real title on the first frame. The detail request still runs and
 * stays authoritative: its result replaces the placeholder, and an error (for
 * example a deleted or foreign list) is shown as an error, never as stale data.
 * The lookup is by id only; data from a previously viewed list is never reused.
 */
export function useList(id: string) {
  const client = useQueryClient();
  return useQuery<WordList, Error, WordList, ReturnType<typeof listKeys.detail>>({
    queryKey: listKeys.detail(id),
    queryFn: ({ signal }) => listsApi.one(id, signal),
    placeholderData: () =>
      client.getQueryData<WordList[]>(listKeys.all)?.find((list) => list.id === id),
  });
}
export function useCreateList() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: listsApi.create,
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: listKeys.all });
    },
  });
}
export function useRenameList() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: listsApi.rename,
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: listKeys.all });
    },
  });
}
export function useDeleteList() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: listsApi.remove,
    onSuccess: async (_data, id) => {
      client.removeQueries({ queryKey: listKeys.detail(id), exact: true });
      await client.invalidateQueries({ queryKey: listKeys.all, exact: true });
    },
  });
}
