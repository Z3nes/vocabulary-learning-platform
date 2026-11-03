import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { englishKey, meaningKey } from '../vocabulary/input.js';
import { shuffle, secureRandomInt, type RandomInt } from '../study/selection.js';
import type { VocabularySnapshot } from './evaluation.js';

export const mixedActivities = ['flashcard', 'written-recall', 'listening', 'choice'] as const;
export type MixedActivity = (typeof mixedActivities)[number];
export interface MixedWord extends VocabularySnapshot {
  originListId: string;
  originListTitle: string;
}
export const choiceDataSchema = z.object({
  options: z.array(z.object({ id: z.uuid(), meanings: z.array(z.string()).min(1) })).length(4),
  correctOptionId: z.uuid(),
});
export type ChoiceData = z.infer<typeof choiceDataSchema>;
const overlap = (a: VocabularySnapshot, b: VocabularySnapshot) => {
  const meanings = new Set(a.meanings.map(meaningKey));
  return b.meanings.some((m) => meanings.has(meaningKey(m)));
};
/** Bounded disjoint choices: never fabricate/duplicate meanings or competing synonyms.
 * A limited search can conservatively fall back to another activity, not an ambiguous quiz.
 */
export function choiceOptions(
  target: VocabularySnapshot,
  pool: readonly VocabularySnapshot[],
  random: RandomInt = secureRandomInt,
): ChoiceData | null {
  const candidates = shuffle(
    pool.filter((w) => englishKey(w.english) !== englishKey(target.english) && !overlap(w, target)),
    random,
  ).slice(0, 128);
  let budget = 3000;
  const choose = (from: number, picked: VocabularySnapshot[]): VocabularySnapshot[] | null => {
    if (picked.length === 3) return picked;
    for (let i = from; i < candidates.length && budget-- > 0; i++) {
      const w = candidates[i]!;
      if (
        picked.every(
          (other) => englishKey(other.english) !== englishKey(w.english) && !overlap(other, w),
        )
      ) {
        const result = choose(i + 1, [...picked, w]);
        if (result) return result;
      }
    }
    return null;
  };
  const distractors = choose(0, []);
  if (!distractors) return null;
  const correctOptionId = randomUUID();
  return {
    correctOptionId,
    options: shuffle(
      [
        { id: correctOptionId, meanings: [...target.meanings] },
        ...distractors.map((w) => ({ id: randomUUID(), meanings: [...w.meanings] })),
      ],
      random,
    ),
  };
}
/** Least-used compatible modes provide balance without repeating a source identity. */
export function planMixed(
  selected: readonly MixedWord[],
  pool: readonly MixedWord[],
  random: RandomInt = secureRandomInt,
) {
  const counts: Record<MixedActivity, number> = {
    flashcard: 0,
    'written-recall': 0,
    listening: 0,
    choice: 0,
  };
  let previous: MixedActivity | null = null;
  return selected.map((word) => {
    const choices = choiceOptions(word, pool, random);
    const available = shuffle(
      mixedActivities.filter((mode) => mode !== 'choice' || choices !== null),
      random,
    );
    const minimum = Math.min(...available.map((mode) => counts[mode]));
    const tied = available.filter((mode) => counts[mode] === minimum);
    const activityType = tied.find((mode) => mode !== previous) ?? tied[0]!;
    counts[activityType]++;
    previous = activityType;
    return { word, activityType, choices: activityType === 'choice' ? choices : null };
  });
}
