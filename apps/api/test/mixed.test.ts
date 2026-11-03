import { describe, expect, it } from 'vitest';
import {
  choiceOptions,
  mixedActivities,
  planMixed,
  type MixedWord,
} from '../src/practice/mixedPlan.js';
import { meaningKey } from '../src/vocabulary/input.js';
import { buildApp } from '../src/app.js';
import { testConfig } from './helpers.js';

const word = (id: number, meanings = [`anlam ${id}`]): MixedWord => ({
  id: String(id),
  english: `term${id}`,
  meanings,
  originListId: 'list',
  originListTitle: 'Source',
});
function rng(seed: number) {
  return (max: number) => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed % max;
  };
}
describe('mixed distribution and owned-pool distractors', () => {
  it.each([1, 2, 3, 4, 7, 8, 31, 100, 250])(
    'assigns %i distinct source words once with balanced compatible modes',
    (size) => {
      const pool = Array.from({ length: size }, (_, i) => word(i));
      const plan = planMixed(pool, pool, rng(size));
      expect(plan).toHaveLength(size);
      expect(new Set(plan.map((q) => q.word.id)).size).toBe(size);
      const counts = mixedActivities.map(
        (mode) => plan.filter((q) => q.activityType === mode).length,
      );
      if (size >= 4) expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
      if (size < 4) expect(plan.every((q) => q.activityType !== 'choice')).toBe(true);
      expect(
        plan.filter((q, i) => i > 0 && q.activityType === plan[i - 1]!.activityType),
      ).toHaveLength(0);
    },
  );
  it('falls back without changing count when meanings overlap or choices are too few', () => {
    const pool = Array.from({ length: 20 }, (_, i) => word(i, ['aynı', 'ortak']));
    expect(planMixed(pool, pool, rng(4)).every((q) => q.activityType !== 'choice')).toBe(true);
    expect(new Set(planMixed(pool, pool, rng(4)).map((q) => q.activityType))).toEqual(
      new Set(['flashcard', 'written-recall', 'listening']),
    );
  });
  it('uses all meanings and disjoint choices with Turkish dotted/dotless normalization', () => {
    const target = word(0, ['İSİM', 'ad']),
      pool = [
        target,
        word(1, ['isim']),
        word(2, ['IŞIK']),
        word(3, ['ışık']),
        word(4, ['ağ']),
        word(5, ['dizi']),
      ];
    const choices = choiceOptions(target, pool, rng(2))!;
    expect(choices.options).toHaveLength(4);
    expect(choices.options.find((o) => o.id === choices.correctOptionId)?.meanings).toEqual(
      target.meanings,
    );
    const keys = choices.options.flatMap((o) => o.meanings.map(meaningKey));
    expect(new Set(keys).size).toBe(keys.length);
  });
  it('does not offer duplicate English identities or fabricate missing alternatives', () => {
    const target = word(0),
      copy = { ...word(1), english: target.english };
    expect(choiceOptions(target, [target, copy, word(2), word(3)], rng(2))).toBeNull();
  });
  it('randomizes correct option positions and freezes independent arrays', () => {
    const pool = Array.from({ length: 8 }, (_, i) => word(i));
    const positions = new Set(
      Array.from({ length: 20 }, (_, i) => {
        const c = choiceOptions(pool[0]!, pool, rng(i))!;
        return c.options.findIndex((o) => o.id === c.correctOptionId);
      }),
    );
    expect(positions.size).toBeGreaterThan(1);
    const c = choiceOptions(pool[0]!, pool, rng(8))!;
    pool[0]!.meanings.push('edited');
    expect(c.options.flatMap((o) => o.meanings)).not.toContain('edited');
  });
  it('keeps source context and does not change selected input', () => {
    const pool = Array.from({ length: 8 }, (_, i) => word(i)),
      saved = structuredClone(pool);
    for (const q of planMixed(pool, pool, rng(3))) expect(q.word.originListTitle).toBe('Source');
    expect(pool).toEqual(saved);
  });
  it('requires authentication on setup, start and every new mixed command', async () => {
    const app = await buildApp({ config: testConfig(), logger: false });
    try {
      expect((await app.inject('/api/mixed')).statusCode).toBe(401);
      for (const url of [
        '/api/mixed',
        ...['reveal', 'self-evaluation', 'choice'].map(
          (a) => `/api/practice/10000000-0000-4000-8000-000000000001/${a}`,
        ),
      ])
        expect((await app.inject({ method: 'POST', url, payload: {} })).statusCode).toBe(401);
    } finally {
      await app.close();
    }
  });
});
