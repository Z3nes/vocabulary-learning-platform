import { describe, expect, it } from 'vitest';
import {
  cells,
  crosswordPlacement,
  crosswordQuality,
  crosswords,
  directions,
  eligibleWords,
  matchSelection,
  wordSearch,
  type Board,
  type Entry,
} from '../src/puzzles/engine.js';
import { sessionCardCount } from '../src/study/selection.js';
import { moveSchema } from '../src/routes/puzzles.js';
import { buildApp } from '../src/app.js';
import { testConfig } from './helpers.js';

const words = (terms: string[]) =>
  eligibleWords(
    terms.map((english, i) => ({
      id: `word-${i}`,
      english,
      meanings: [`anlam ${i}`, `diğer ${i}`],
    })),
  ).eligible;
const terms = [
  'algorithm',
  'recursion',
  'database',
  'network',
  'array',
  'tree',
  'graph',
  'queue',
  'stack',
  'server',
  'client',
  'router',
  'machine learning',
  'SQL',
  'API',
  'JSON',
  'code',
  'class',
  'object',
  'function',
];
function rng(seed: number) {
  return (max: number) => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed % max;
  };
}

describe('explicit board vocabulary policy', () => {
  it.each([
    'cat',
    'SQL',
    'API',
    'JSON',
    'machine learning',
    '  Machine\t learning  ',
    'go',
    'abcdefghijklmnopqr',
  ])('accepts %s', (english) => {
    const [w] = words([english]);
    expect(w?.english).toBe(english);
    expect(w?.letters).toBe(english.trim().replace(/\s+/gu, '').toUpperCase());
    expect(w?.meanings).toHaveLength(2);
  });
  it.each([
    'C++',
    'C#',
    'v2',
    '3D',
    'node.js',
    "don't",
    'ice-cream',
    'café',
    'İ',
    'ı',
    'A',
    'abcdefghijklmnopqrs',
    '!!!',
    '',
  ])('explains excluded %s without transliteration', (english) => {
    const result = eligibleWords([{ id: 'a', english, meanings: ['anlam'] }]);
    expect(result.eligible).toHaveLength(0);
    expect(result.omitted).toEqual([expect.objectContaining({ english })]);
  });
  it('excludes all collapsed duplicates and preserves independent original meaning snapshots', () => {
    const source = ['ice cream', 'icecream', 'ICECREAM', 'cat'].map((english, i) => ({
      id: `${i}`,
      english,
      meanings: ['anlam'],
    }));
    const result = eligibleWords(source);
    expect(result.eligible.map((w) => w.english)).toEqual(['cat']);
    expect(result.omitted.map((w) => w.reason)).toEqual(['ambiguous', 'ambiguous', 'ambiguous']);
  });
  it.each([
    [0, [0, 0, 0, 0]],
    [1, [1, 1, 1, 1]],
    [7, [2, 2, 4, 7]],
    [250, [38, 63, 125, 250]],
  ])('reuses selection boundaries for %i', (count, expected) => {
    expect(([15, 25, 50, 100] as const).map((p) => sessionCardCount(count, p))).toEqual(expected);
  });
});
describe('real word-search placement', () => {
  it.each(directions)(
    'validates exact endpoints in direction %i,%i and both selection orders',
    (dr, dc) => {
      const e: Entry = {
        ...words(['cat'])[0]!,
        row: 3,
        col: 3,
        dr,
        dc,
        number: 0,
        solved: false,
        attempts: 0,
      };
      const b: Board = {
        rows: 7,
        cols: 7,
        grid: Array<string>(49).fill('X'),
        draft: [],
        entries: [e],
      };
      const end = (3 + 2 * dr) * 7 + 3 + 2 * dc;
      expect(matchSelection(b, 24, end)).toEqual(e);
      expect(matchSelection(b, end, 24)).toEqual(e);
      expect(matchSelection(b, 24, 24)).toBeUndefined();
      expect(matchSelection(b, 24, end + 1)).toBeUndefined();
      expect(matchSelection(b, -1, end)).toBeUndefined();
      expect(matchSelection(b, 24, 49)).toBeUndefined();
    },
  );
  it('partitions a large pool with every identity once, valid intersections, bounded grids and filled cells', () => {
    const source = words(
      Array.from(
        { length: 180 },
        (_, i) =>
          `term${String.fromCharCode(65 + Math.floor(i / 26))}${String.fromCharCode(65 + (i % 26))}`,
      ),
    );
    const boards = wordSearch(source, rng(29));
    expect(boards.length).toBeGreaterThan(1);
    expect(new Set(boards.flatMap((b) => b.entries.map((e) => e.id))).size).toBe(180);
    const used = new Set<string>();
    let intersections = 0;
    for (const b of boards) {
      expect(b.rows).toBeLessThanOrEqual(20);
      expect(b.cols).toBeLessThanOrEqual(20);
      expect(b.entries.length).toBeLessThanOrEqual(8);
      expect(b.grid.every((c) => /^[A-Z]$/.test(c))).toBe(true);
      const occupied = new Set<number>();
      for (const e of b.entries) {
        used.add(`${e.dr}:${e.dc}`);
        for (const c of cells(e)) {
          expect(c.row).toBeGreaterThanOrEqual(0);
          expect(c.row).toBeLessThan(b.rows);
          expect(c.col).toBeGreaterThanOrEqual(0);
          expect(c.col).toBeLessThan(b.cols);
          const i = c.row * b.cols + c.col;
          expect(b.grid[i]).toBe(c.letter);
          if (occupied.has(i)) intersections++;
          occupied.add(i);
        }
      }
    }
    expect(used.size).toBe(8);
    expect(intersections).toBeGreaterThan(0);
  });
  it('supports one word and phrases while retaining original spelling', () => {
    const boards = wordSearch(words(['Machine learning']), rng(2));
    expect(boards[0]!.entries[0]).toMatchObject({
      english: 'Machine learning',
      letters: 'MACHINELEARNING',
      segments: [7, 8],
    });
  });
});

/** Every maximal horizontal/vertical run of >=2 cells must be a declared answer.
 * This catches unintended adjacency and accidental words independently of the placer.
 */
function assertRuns(b: Board) {
  const actual: string[] = [];
  for (const dr of [0, 1])
    for (let r = 0; r < b.rows; r++)
      for (let c = 0; c < b.cols; c++) {
        if (!b.grid[r * b.cols + c]) continue;
        const pr = r - dr,
          pc = c - (1 - dr);
        if (pr >= 0 && pc >= 0 && b.grid[pr * b.cols + pc]) continue;
        let rr = r,
          cc = c,
          word = '';
        while (rr < b.rows && cc < b.cols && b.grid[rr * b.cols + cc]) {
          word += b.grid[rr * b.cols + cc];
          rr += dr;
          cc += 1 - dr;
        }
        if (word.length >= 2) actual.push(`${r}:${c}:${dr}:${word}`);
      }
  expect(actual.sort()).toEqual(
    b.entries.map((e) => `${e.row}:${e.col}:${e.dr}:${e.letters}`).sort(),
  );
}
describe('connected, bounded crossword construction', () => {
  it.each([1, 2, 3, 4, 5, 7, 19, 42, 81, 91])(
    'builds genuine compact crosswords with seed %i',
    (seed) => {
      const result = crosswords(words(terms), rng(seed));
      expect(result.boards.length).toBeGreaterThan(0);
      const ids = result.boards.flatMap((b) => b.entries.map((e) => e.id));
      expect(new Set([...ids, ...result.omitted.map((e) => e.id)]).size).toBe(terms.length);
      expect(ids.length + result.omitted.length).toBe(terms.length);
      for (const b of result.boards) {
        expect(crosswordQuality(b)).toBe(true);
        assertRuns(b);
        expect(new Set(b.entries.map((e) => e.dr))).toEqual(new Set([0, 1]));
        const starts = [...new Set(b.entries.map((e) => e.row * b.cols + e.col))].sort(
          (a, b) => a - b,
        );
        for (const e of b.entries)
          expect(e.number).toBe(starts.indexOf(e.row * b.cols + e.col) + 1);
      }
    },
  );
  it.each(
    [[], ['cat'], ['cat', 'art'], ['aaa', 'bbb', 'ccc'], ['aa', 'bb', 'cc', 'dd']].map((terms) => ({
      terms,
    })),
  )('honestly refuses impossible input $terms', ({ terms }) => {
    const result = crosswords(words(terms), rng(1));
    expect(result.boards).toEqual([]);
    expect(result.omitted).toHaveLength(terms.length);
  });
  it('terminates deterministically and never mutates the input', () => {
    const source = words(terms),
      original = structuredClone(source);
    expect(crosswords(source, rng(42))).toEqual(crosswords(source, rng(42)));
    expect(source).toEqual(original);
  });
  it('rejects collisions, adjacency, identical overlap, disconnected placements and oversized extensions', () => {
    const [cat, art] = words(['cat', 'art']);
    const first: Entry = {
      ...cat!,
      row: 0,
      col: 0,
      dr: 0,
      dc: 1,
      number: 1,
      solved: false,
      attempts: 0,
    };
    for (const candidate of [
      { ...art!, row: 0, col: 0, dr: 1, dc: 0 },
      { ...art!, row: 1, col: 0, dr: 0, dc: 1 },
      { ...cat!, row: 0, col: 0, dr: 0, dc: 1 },
      { ...art!, row: 8, col: 8, dr: 1, dc: 0 },
    ])
      expect(crosswordPlacement([first], { ...first, ...candidate })).toBeNull();
    expect(
      crosswordQuality({ rows: 1, cols: 3, grid: [...'CAT'], draft: [], entries: [first] }),
    ).toBe(false);
    const [wide, tall, extension] = words([
      'ABCDEFGHIJKLMNOPQR',
      'RSTUVWXYZABCDEFGHI',
      'IABCDEFGHIJKLMNOPQ',
    ]);
    const across: Entry = { ...first, ...wide! };
    const down: Entry = { ...first, ...tall!, col: 17, dr: 1, dc: 0 };
    expect(crosswordPlacement([across], down)).toBe(1);
    expect(
      crosswordPlacement([across, down], { ...first, ...extension!, row: 17, col: 17 }),
    ).toBeNull();
  });
  it('partitions large vocabulary without duplicates, fillers or silent omissions', () => {
    const source = words(
      Array.from(
        { length: 120 },
        (_, i) =>
          `term${String.fromCharCode(65 + Math.floor(i / 26))}${String.fromCharCode(65 + (i % 26))}`,
      ),
    );
    const result = crosswords(source, rng(4));
    expect(result.boards.length).toBeGreaterThan(1);
    expect(result.boards.flatMap((b) => b.entries).length + result.omitted.length).toBe(120);
    for (const b of result.boards) {
      expect(crosswordQuality(b)).toBe(true);
      assertRuns(b);
    }
  }, 20000);
});
describe('strict puzzle commands and authentication boundary', () => {
  it.each([
    { action: 'select', solvedIds: ['a'] },
    { action: 'check', answer: 'cat' },
    { action: 'complete', score: 100 },
    { action: 'draft', values: ['Ç'] },
    { action: 'select', start: 0, end: 400 },
  ])('rejects forged payload %j', (payload) =>
    expect(moveSchema.safeParse(payload).success).toBe(false),
  );
  it('protects every puzzle route without an identity', async () => {
    const app = await buildApp({ config: testConfig(), logger: false });
    try {
      for (const [method, url, payload] of [
        [
          'GET',
          '/api/lists/10000000-0000-4000-8000-000000000001/puzzles?gameType=crossword',
          undefined,
        ],
        ['GET', '/api/puzzles/10000000-0000-4000-8000-000000000001', undefined],
        ['POST', '/api/puzzles/10000000-0000-4000-8000-000000000001/moves', {}],
        ['POST', '/api/puzzles/10000000-0000-4000-8000-000000000001/complete', {}],
        ['POST', '/api/puzzles/10000000-0000-4000-8000-000000000001/cancel', {}],
      ] as const)
        expect(
          (await app.inject({ method, url, ...(payload ? { payload } : {}) })).statusCode,
        ).toBe(401);
    } finally {
      await app.close();
    }
  });
});
