import { ApiError, isRecord, request } from './api';

export interface SentenceSource {
  id: string;
  text: string;
  sourceUrl: string;
  contributor?: string;
  license: { name: string; url: string };
}
export interface ExampleSentence extends SentenceSource {
  provider: 'Tatoeba';
  matchedForm: string;
  translation?: SentenceSource;
}
const licenseUrls: Record<string, string> = {
  'CC BY 2.0 FR': 'https://creativecommons.org/licenses/by/2.0/fr/',
  'CC0 1.0': 'https://creativecommons.org/publicdomain/zero/1.0/',
};
function isSource(value: unknown): value is SentenceSource {
  return (
    isRecord(value) &&
    typeof value['id'] === 'string' &&
    /^[1-9]\d{0,15}$/u.test(value['id']) &&
    Number.isSafeInteger(Number(value['id'])) &&
    typeof value['text'] === 'string' &&
    value['text'].trim().length > 0 &&
    value['text'].length <= 280 &&
    value['sourceUrl'] === `https://tatoeba.org/en/sentences/show/${value['id']}` &&
    (value['contributor'] === undefined || typeof value['contributor'] === 'string') &&
    isRecord(value['license']) &&
    typeof value['license']['name'] === 'string' &&
    Object.hasOwn(licenseUrls, value['license']['name']) &&
    value['license']['url'] === licenseUrls[value['license']['name']]
  );
}
export async function fetchExamples(
  path: string,
  exclude: string[],
  signal: AbortSignal,
): Promise<ExampleSentence[]> {
  const query = exclude.length ? `?${new URLSearchParams({ exclude: exclude.join(',') })}` : '';
  const result = await request(`${path}${query}`, 'GET', undefined, signal);
  if (
    !isRecord(result) ||
    !Array.isArray(result['examples']) ||
    result['examples'].length > 3 ||
    !result['examples'].every(
      (value: unknown) =>
        isSource(value) &&
        isRecord(value) &&
        value['provider'] === 'Tatoeba' &&
        typeof value['matchedForm'] === 'string' &&
        (value['translation'] === undefined || isSource(value['translation'])),
    )
  ) {
    throw new ApiError('Invalid example response', 502, 'EXAMPLES_INVALID_RESPONSE');
  }
  return result['examples'] as ExampleSentence[];
}
export const examplePaths = {
  word: (listId: string, wordId: string) =>
    `/lists/${encodeURIComponent(listId)}/words/${encodeURIComponent(wordId)}/examples`,
  card: (sessionId: string, cardId: string) =>
    `/study-sessions/${encodeURIComponent(sessionId)}/cards/${encodeURIComponent(cardId)}/examples`,
};
