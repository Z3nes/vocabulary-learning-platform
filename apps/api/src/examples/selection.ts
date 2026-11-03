import { normalizeText, tokens } from './matching.js';
import type { ExampleSentence } from './types.js';

/** Hard rule: one sentence ID and one normalized text per pool/result. */
export function uniqueCandidates(candidates: readonly ExampleSentence[]): ExampleSentence[] {
  const ids = new Set<string>();
  const texts = new Set<string>();
  return candidates.filter((candidate) => {
    const text = normalizeText(candidate.text).replace(/[^\p{L}\p{N}']/gu, '');
    if (ids.has(candidate.id) || texts.has(text)) return false;
    ids.add(candidate.id);
    texts.add(text);
    return true;
  });
}

type Scored = Pick<ExampleSentence, 'text' | 'matchedForm' | 'translation'>;

/** Words around the matched expression ("You ran." -> 1, "I try to run every day." -> 5). */
export function contextWords(candidate: Pick<ExampleSentence, 'text' | 'matchedForm'>): number {
  return Math.max(0, tokens(candidate.text).length - tokens(candidate.matchedForm).length);
}

/** Soft context-quality tier, 0-3, from the number of context words:
 *
 *   0-1 words -> 0   "You ran.", "Keep running."   (no usable context)
 *   2 words   -> 1   "Tom runs fast."
 *   3 words   -> 2   "Igor lost his memory."
 *   4-15      -> 3   "I try to run every day."      (ideal: ~5-17 word sentences)
 *   16-22     -> 2   long; harder for learners to read
 *   23+       -> 1   very long
 *
 * Length is a proxy, not a guarantee of usefulness. Tiers are deliberately coarse
 * so that translation, variety and rotation decide between comparable sentences.
 */
export function contextTier(words: number): number {
  if (words <= 1) return 0;
  if (words <= 3) return words - 1;
  if (words <= 15) return 3;
  return words <= 22 ? 2 : 1;
}

/** A direct Turkish translation helps within a tier but never lifts a sentence
 * past a better tier: a strong English-only example still beats a weak translated one. */
export const TRANSLATION_BONUS = 0.5;
/** Trailing ellipsis marks an unfinished fragment ("If my memory serves me well..."). */
export const FRAGMENT_PENALTY = 1;

export function exampleQuality(candidate: Scored): number {
  return (
    contextTier(contextWords(candidate)) -
    (/(?:\.\.\.|…)\s*$/u.test(candidate.text) ? FRAGMENT_PENALTY : 0) +
    (candidate.translation ? TRANSLATION_BONUS : 0)
  );
}

/** Tokens with the matched expression collapsed into one placeholder, so that
 * "run"/"ran" or a multiword expression never counts as a difference by itself. */
export function structure(candidate: Pick<ExampleSentence, 'text' | 'matchedForm'>): string[] {
  const words = tokens(candidate.text);
  const target = tokens(candidate.matchedForm);
  const start = words.findIndex((_, index) =>
    target.every((token, offset) => words[index + offset] === token),
  );
  return start < 0
    ? words
    : [...words.slice(0, start), '\u0000', ...words.slice(start + target.length)];
}

function tokenDistance(a: readonly string[], b: readonly string[]): number {
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1)
      current[j] = Math.min(
        previous[j]! + 1,
        current[j - 1]! + 1,
        previous[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    previous = current;
  }
  return previous[b.length]!;
}

/** Near-duplicate structure: at most one word inserted/removed/replaced (e.g. a
 * name substitution, "Igor/Stefan lost his memory."), or at most 40% of the longer
 * sentence's words. Word-level edit distance only; no semantic similarity model. */
export function nearDuplicate(a: readonly string[], b: readonly string[]): boolean {
  const allowed = Math.max(1, 0.4 * Math.max(a.length, b.length));
  return Math.abs(a.length - b.length) <= allowed && tokenDistance(a, b) <= allowed;
}

/** Selection preferences, subtracted from exampleQuality. They are preferences,
 * never filters: if only short, repeated or similar sentences exist, they are used. */
export const PENALTY = {
  /** Shown in one of the student's recent requests (client `exclude`). Smaller than
   * two tiers, so a recent good example still beats a fresh "You ran.". */
  shown: 1.5,
  /** Near-duplicate of a recently shown sentence: it would not feel new. */
  nearShown: 1,
  /** Near-duplicate of an example already chosen for this result. */
  nearSelected: 2,
  /** Same inflected form as an already chosen example; smaller than the
   * translation bonus, so form variety never overrides quality. */
  repeatedForm: 0.25,
} as const;

/** Greedy server-side selection of up to three examples from a validated pool:
 * highest quality minus the penalties above; ties keep the provider's order.
 * Deterministic, so a shared cached pool rotates through `exclude` alone.
 */
export function selectExamples(
  candidates: readonly ExampleSentence[],
  exclude: readonly string[],
): ExampleSentence[] {
  const recent = new Set(exclude);
  const pool = uniqueCandidates(candidates).map((candidate) => ({
    candidate,
    quality: exampleQuality(candidate),
    structure: structure(candidate),
    nearSelected: false,
    penalty: 0,
  }));
  const shown = pool.filter((item) => recent.has(item.candidate.id));
  for (const item of pool)
    item.penalty = recent.has(item.candidate.id)
      ? PENALTY.shown
      : shown.some((old) => nearDuplicate(old.structure, item.structure))
        ? PENALTY.nearShown
        : 0;
  const forms = new Set<string>();
  const selected: ExampleSentence[] = [];
  while (pool.length && selected.length < 3) {
    let best = 0;
    let bestScore = -Infinity;
    pool.forEach((item, index) => {
      const score =
        item.quality -
        item.penalty -
        (item.nearSelected ? PENALTY.nearSelected : 0) -
        (forms.has(item.candidate.matchedForm) ? PENALTY.repeatedForm : 0);
      if (score > bestScore) [best, bestScore] = [index, score];
    });
    const [chosen] = pool.splice(best, 1);
    selected.push(chosen!.candidate);
    forms.add(chosen!.candidate.matchedForm);
    for (const item of pool) item.nearSelected ||= nearDuplicate(chosen!.structure, item.structure);
  }
  return selected;
}
