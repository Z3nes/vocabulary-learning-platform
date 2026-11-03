import { englishKey, meaningKey } from '../vocabulary/input.js';

export interface VocabularySnapshot {
  id: string;
  english: string;
  meanings: string[];
}
const meaningSet = (word: VocabularySnapshot) => new Set(word.meanings.map(meaningKey));

const signature = (meanings: Set<string>) => JSON.stringify([...meanings].sort());

/** Index the owned list once; avoid re-normalizing every word for every question. */
export function createAnswerSnapshotter(words: readonly VocabularySnapshot[]) {
  const completeSets = new Map<string, Set<string>>();
  const byMeaning = new Map<string, Set<string>>();
  for (const word of words) {
    const meanings = meaningSet(word);
    const key = englishKey(word.english);
    const group = signature(meanings);
    if (!completeSets.has(group)) completeSets.set(group, new Set());
    completeSets.get(group)!.add(key);
    for (const meaning of meanings) {
      if (!byMeaning.has(meaning)) byMeaning.set(meaning, new Set());
      byMeaning.get(meaning)!.add(key);
    }
  }
  return (target: VocabularySnapshot) => {
    const meanings = meaningSet(target);
    const accepted = new Set(completeSets.get(signature(meanings)));
    accepted.add(englishKey(target.english));
    const overlapping = new Set<string>();
    for (const meaning of meanings)
      for (const key of byMeaning.get(meaning) ?? []) if (!accepted.has(key)) overlapping.add(key);
    return { acceptedAnswers: [...accepted], overlappingAnswers: [...overlapping] };
  };
}

/** Complete-set alternatives and genuine overlaps are frozen with each question. */
export const answerSnapshot = (target: VocabularySnapshot, words: readonly VocabularySnapshot[]) =>
  createAnswerSnapshotter(words)(target);

export function evaluateAnswer(
  question: { english: string; acceptedAnswers: string[]; overlappingAnswers: string[] },
  answer: string,
) {
  const normalizedAnswer = englishKey(answer);
  const masteryEligible = normalizedAnswer === englishKey(question.english);
  const correct = question.acceptedAnswers.includes(normalizedAnswer);
  return {
    normalizedAnswer,
    correct,
    masteryEligible,
    feedback: masteryEligible
      ? 'target'
      : correct
        ? 'alternative'
        : question.overlappingAnswers.includes(normalizedAnswer)
          ? 'overlap'
          : 'incorrect',
  } as const;
}
