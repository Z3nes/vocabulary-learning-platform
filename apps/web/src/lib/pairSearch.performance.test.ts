import { expect, it } from 'vitest';
import { distinctPairs, meaningKey, overlaps, type Snapshot } from './games';

it('measures exact pair selection for a synthetic overlapping vocabulary pool', () => {
  const words: Snapshot[] = Array.from({ length: 40 }, (_, i) => ({
    wordId: `word-${i}`,
    english: `term${i}`,
    meanings: [`group ${i % 5}`, `unique ${i}`],
  }));
  const start = performance.now();
  const pairs = distinctPairs(words, 6);
  console.info(
    `Session 11: exact selection from ${words.length} overlapping entries took ${(performance.now() - start).toFixed(2)} ms`,
  );
  expect(pairs).toHaveLength(5);
  expect(pairs.every((a, i) => pairs.slice(i + 1).every((b) => !overlaps(a, b)))).toBe(true);
});

it('preserves the exact maximum against exhaustive subsets with varied overlaps and Turkish meanings', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const pool: Snapshot[] = Array.from({ length: 9 }, (_, i) => ({
      wordId: `${i}`,
      english: `term${i}`,
      meanings: [`anlam ${(i * seed) % 7}`, i % 2 ? 'IŞIK' : `anlam ${(i + seed) % 6}`],
    }));
    const normalized = pool.map((word) => new Set(word.meanings.map(meaningKey)));
    let maximum = 0;
    for (let mask = 1; mask < 1 << pool.length; mask++) {
      const indexes = pool.flatMap((_, i) => (mask & (1 << i) ? [i] : []));
      if (
        indexes.every((a, i) =>
          indexes
            .slice(i + 1)
            .every((b) => ![...normalized[a]!].some((key) => normalized[b]!.has(key))),
        )
      )
        maximum = Math.max(maximum, indexes.length);
    }
    const selected = distinctPairs(pool, 6);
    expect(selected).toHaveLength(Math.min(6, maximum));
    expect(
      selected.every((word, i) => selected.slice(i + 1).every((other) => !overlaps(word, other))),
    ).toBe(true);
  }
});
