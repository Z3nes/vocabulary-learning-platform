import { ApiError, isRecord, request } from './api';
import type { Word } from './words';
import { puzzleNames } from './puzzles';

export const gameNames = {
  quiz: 'Klasik test',
  matching: 'Eşleştirme',
  assembly: 'Kelime Oluşturma',
  memory: 'Hafıza Oyunu',
} as const;
export const historyGameNames = {
  ...gameNames,
  ...puzzleNames,
  'written-recall': 'Yazılı Cevap',
  listening: 'Dinle ve Yaz',
  mixed: 'Karma Çalışma',
} as const;
export type GameType = keyof typeof gameNames;
export interface Snapshot {
  wordId: string | null;
  english: string;
  meanings: string[];
}
export interface GameItem extends Snapshot {
  outcome: 'correct' | 'incorrect' | 'revealed' | 'matched';
  attempts: number;
}
export interface Completion {
  completionId: string;
  listId: string;
  gameType: GameType;
  status: 'completed';
  items: GameItem[];
}
export const snapshot = (word: Word): Snapshot => ({
  wordId: word.id,
  english: word.english,
  meanings: word.meanings.map((m) => m.turkish),
});
export const meaningKey = (value: string) =>
  value.trim().normalize('NFC').replace(/\s+/gu, ' ').toLocaleLowerCase('tr-TR');
export const overlaps = (a: Snapshot, b: Snapshot) =>
  a.meanings.some((x) => b.meanings.some((y) => meaningKey(x) === meaningKey(y)));
export function shuffle<T>(items: readonly T[], random = Math.random): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}
/** Exact compatible-set search with a safe upper bound; never discard valid choices. */
export function distinctPairs(candidates: readonly Snapshot[], max: number): Snapshot[] {
  const unique = [
    ...new Map(
      candidates.map((word) => [
        JSON.stringify([...new Set(word.meanings.map(meaningKey))].sort()),
        word,
      ]),
    ).values(),
  ];
  const keys = new Map(unique.map((word) => [word, new Set(word.meanings.map(meaningKey))]));
  const intersects = (a: Set<string>, b: Set<string>) => [...a].some((key) => b.has(key));
  // Partition the remaining words into groups sharing a meaning. At most one
  // member of each group can be chosen, so this is an upper bound, not a greedy
  // replacement for the exact search. Stop counting once pruning is impossible.
  const canImprove = (remaining: Snapshot[], size: number, bestSize: number) => {
    const groups: Set<string>[] = [];
    for (const word of remaining) {
      const meanings = keys.get(word)!;
      const group = groups.findIndex((common) => intersects(common, meanings));
      if (group < 0) groups.push(meanings);
      else groups[group] = new Set([...groups[group]!].filter((key) => meanings.has(key)));
      if (size + groups.length > bestSize) return true;
    }
    return false;
  };
  let best: Snapshot[] = [];
  const visit = (remaining: Snapshot[], chosen: Snapshot[]): boolean => {
    if (chosen.length > best.length) best = chosen;
    if (best.length === max) return true;
    if (
      chosen.length + remaining.length <= best.length ||
      !canImprove(remaining, chosen.length, best.length)
    )
      return false;
    for (let i = 0; i < remaining.length; i++) {
      const word = remaining[i]!;
      const compatible = remaining
        .slice(i + 1)
        .filter((other) => !intersects(keys.get(word)!, keys.get(other)!));
      if (visit(compatible, [...chosen, word])) return true;
    }
    return false;
  };
  visit(unique, []);
  return best;
}
export interface Question {
  target: Snapshot;
  options: Snapshot[];
}
export function quizQuestions(words: readonly Snapshot[], random = Math.random): Question[] {
  if (distinctPairs(words, 4).length < 4) return [];
  const questions: Question[] = [];
  for (const target of shuffle(words, random)) {
    const others = distinctPairs(
      shuffle(
        words.filter((word) => word.wordId !== target.wordId && !overlaps(word, target)),
        random,
      ),
      3,
    );
    if (others.length === 3)
      questions.push({ target, options: shuffle([target, ...others], random) });
    if (questions.length === 10) break;
  }
  return questions;
}
export const eligible = (word: Snapshot) => /^[A-Za-z]{3,12}$/.test(word.english);
export function scrambled(word: string): string[] {
  const letters = shuffle([...word.toLowerCase()]);
  if (letters.join('') === word.toLowerCase() && new Set(letters).size > 1) {
    const different = letters.findIndex((letter) => letter !== letters[0]);
    [letters[0], letters[different]] = [letters[different]!, letters[0]!];
  }
  return letters;
}
export function canAssemble(answer: string, word: string): boolean {
  const available = [...word.toLowerCase()];
  return [...answer.toLowerCase()].every((letter) => {
    const index = available.indexOf(letter);
    if (index < 0) return false;
    available.splice(index, 1);
    return true;
  });
}
export async function saveCompletion(input: Completion) {
  const value = await request('/games/completions', 'POST', input);
  if (
    !isRecord(value) ||
    !isRecord(value['game']) ||
    typeof value['game']['id'] !== 'string' ||
    typeof value['applied'] !== 'boolean'
  )
    throw new ApiError('Invalid API response', 200);
  return value['game']['id'];
}
