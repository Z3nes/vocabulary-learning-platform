import { randomInt } from 'node:crypto';

/** The only session sizes a student can choose (percent of the list). */
export const studyPercentages = [15, 25, 50, 100] as const;
export type StudyPercentage = (typeof studyPercentages)[number];

/** Returns an integer in [0, maxExclusive). Injected in tests for determinism. */
export type RandomInt = (maxExclusive: number) => number;
export const secureRandomInt: RandomInt = (maxExclusive) => randomInt(maxExclusive);

/**
 * Cards in a session: ceil(total * percentage / 100), never more than the list.
 * 7 words at 15% -> 2; 10 at 25% -> 3; 150 at 15% -> 23. Integer arithmetic avoids
 * floating-point surprises such as 100 * 0.15 = 15.000000000000002.
 */
export function sessionCardCount(totalWords: number, percentage: StudyPercentage): number {
  if (!Number.isInteger(totalWords) || totalWords < 0) throw new RangeError('totalWords');
  return Math.min(totalWords, Math.ceil((totalWords * percentage) / 100));
}

/** Fisher–Yates shuffle into a new array. */
export function shuffle<T>(items: readonly T[], random: RandomInt = secureRandomInt): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = random(i + 1);
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}

export interface SelectionCandidate {
  id: string;
  /** The word was missed and has not yet been cleared by two later KNOWN results. */
  needsReview: boolean;
}

/**
 * Chooses the words for a new session and their presentation order.
 *
 * Priority affects selection only: words that need review are taken first (a random
 * subset if there are more than fit), the rest of the capacity is filled randomly from
 * the other words, and the final selection is shuffled so priority words are not
 * presented first. Duplicate ids in the input are ignored.
 */
export function selectSessionWords(
  candidates: readonly SelectionCandidate[],
  percentage: StudyPercentage,
  random: RandomInt = secureRandomInt,
): string[] {
  const unique = [...new Map(candidates.map((candidate) => [candidate.id, candidate])).values()];
  const capacity = sessionCardCount(unique.length, percentage);
  const priority = shuffle(
    unique.filter((candidate) => candidate.needsReview),
    random,
  ).slice(0, capacity);
  const others = shuffle(
    unique.filter((candidate) => !candidate.needsReview),
    random,
  ).slice(0, capacity - priority.length);
  return shuffle([...priority, ...others], random).map((candidate) => candidate.id);
}
