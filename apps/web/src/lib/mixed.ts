import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, isRecord, request } from './api';
import { isPracticeSession, practiceKeys } from './practice';
import type { StudyPercentage } from './study';

export function useMixedSetup(listId: string | null) {
  return useQuery({
    queryKey: ['mixed-setup', listId],
    staleTime: 0,
    queryFn: async ({ signal }) => {
      const data = await request(
        `/mixed${listId ? `?listId=${encodeURIComponent(listId)}` : ''}`,
        'GET',
        undefined,
        signal,
      );
      if (
        !isRecord(data) ||
        typeof data['title'] !== 'string' ||
        !Number.isSafeInteger(data['eligibleCount']) ||
        Number(data['eligibleCount']) < 0 ||
        !(data['session'] === null || isPracticeSession(data['session'])) ||
        !Array.isArray(data['resumable'])
      )
        throw new ApiError('Invalid API response', 200);
      const resumable = data['resumable'].map((s: unknown) => {
        if (
          !isRecord(s) ||
          typeof s['id'] !== 'string' ||
          typeof s['listTitle'] !== 'string' ||
          !Number.isSafeInteger(s['questionCount'])
        )
          throw new ApiError('Invalid API response', 200);
        return {
          id: s['id'],
          listTitle: s['listTitle'],
          questionCount: Number(s['questionCount']),
        };
      });
      return {
        title: data['title'],
        eligibleCount: Number(data['eligibleCount']),
        session: data['session'],
        resumable,
      };
    },
  });
}
export function useStartMixed(listId: string | null) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (percentage: StudyPercentage) => {
      const data = await request('/mixed', 'POST', { listId, percentage });
      if (!isRecord(data) || !isPracticeSession(data['session']))
        throw new ApiError('Invalid API response', 200);
      return data['session'];
    },
    onSuccess: (s) => {
      client.setQueryData(practiceKeys.session(s.id), s);
      void client.invalidateQueries({ queryKey: ['mixed-setup'] });
    },
    onError: () => {
      void client.invalidateQueries({ queryKey: ['mixed-setup'] });
    },
  });
}
