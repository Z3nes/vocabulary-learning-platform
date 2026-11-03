import { describe, expect, it } from 'vitest';
import {
  meaningKey,
  meaningSimilarityKey,
  parseBulk,
  parseEntry,
} from '../src/vocabulary/input.js';
import { planVocabulary, type StoredWord } from '../src/vocabulary/plan.js';

const stored: StoredWord[] = [
  {
    id: 'word',
    english: 'run',
    normalizedEnglishKey: 'run',
    meanings: [{ turkish: 'çalışmak', normalizedMeaningKey: 'çalışmak', position: 0 }],
  },
];
describe('Turkish keyboard similarity is separate from exact equality', () => {
  it.each([
    ['çalışmak', 'calismak'],
    ['öğrenmek', 'ogrenmek'],
    ['gol', 'göl'],
    ['ol', 'öl'],
    ['IŞIK', 'isik'],
  ])('warns for %s / %s without changing canonical keys', (first, second) => {
    expect(meaningSimilarityKey(first)).toBe(meaningSimilarityKey(second));
    expect(meaningKey(first)).not.toBe(meaningKey(second));
  });
  it('folds only the Turkish keyboard characters, preserving other diacritics', () => {
    expect(meaningSimilarityKey(' ÇĞIİÖŞÜ ')).toBe('cgiiosu');
    expect(meaningSimilarityKey('café')).not.toBe(meaningSimilarityKey('cafe'));
  });
  it('keeps exact Turkish case duplicates automatic', () => {
    const result = planVocabulary(parseEntry({ english: 'RUN', meanings: ['ÇALIŞMAK'] }), stored);
    expect(result.unresolvedDecisions).toBe(0);
    expect(result.counts.skippedMeanings).toBe(1);
    expect(result.rows[0]?.meanings[0]).toEqual({ turkish: 'ÇALIŞMAK', status: 'existing' });
  });
  it('requires an explicit choice for a possible duplicate and shows both values', () => {
    const result = planVocabulary(parseEntry({ english: 'run', meanings: ['calismak'] }), stored);
    expect(result.canCommit).toBe(false);
    expect(result.unresolvedDecisions).toBe(1);
    expect(result.changes).toEqual([]);
    expect(result.rows[0]?.meanings[0]).toMatchObject({
      turkish: 'calismak',
      status: 'possible_duplicate',
      similarity: { id: '1:1', existing: 'çalışmak', action: null },
    });
    expect(result.counts.skippedMeanings).toBe(0);
  });
  it.each(['skip', 'keep'] as const)(
    'applies %s identically for single and bulk entry',
    (action) => {
      const decisions = [{ id: '1:1', action }];
      const single = planVocabulary(
        parseEntry({ english: 'run', meanings: ['calismak'] }),
        stored,
        decisions,
      );
      const bulk = planVocabulary(parseBulk('run=calismak'), stored, decisions);
      expect(single).toEqual(bulk);
      expect(single.unresolvedDecisions).toBe(0);
      expect(single.counts.newMeanings).toBe(action === 'keep' ? 1 : 0);
      expect(single.counts.skippedMeanings).toBe(action === 'skip' ? 1 : 0);
      expect(single.rows[0]?.meanings[0]?.similarity?.action).toBe(action);
    },
  );
  it('keeps genuinely different folded collisions only with explicit keep decisions', () => {
    const input = parseBulk('goal=gol;göl\nbe=ol;öl');
    const pending = planVocabulary(input, []);
    expect(pending.unresolvedDecisions).toBe(2);
    expect(pending.canCommit).toBe(false);
    const accepted = planVocabulary(
      input,
      [],
      [
        { id: '1:2', action: 'keep' },
        { id: '2:2', action: 'keep' },
      ],
    );
    expect(accepted.changes.map((word) => word.additions.map((meaning) => meaning.key))).toEqual([
      ['gol', 'göl'],
      ['ol', 'öl'],
    ]);
  });
  it('deduplicates repeated possible meanings in a batch and applies the first source decision', () => {
    const input = parseBulk('run=çalışmak\nRUN=calismak\nrun=Calismak');
    const pending = planVocabulary(input, []);
    expect(pending.unresolvedDecisions).toBe(1);
    const result = planVocabulary(input, [], [{ id: '2:1', action: 'skip' }]);
    expect(result.counts).toMatchObject({ newWords: 1, newMeanings: 1, skippedMeanings: 2 });
    expect(result.rows[2]?.meanings[0]?.status).toBe('repeated');
    expect(result.changes[0]?.additions.map((meaning) => meaning.turkish)).toEqual(['çalışmak']);
  });
  it('never anchors a warning to a skipped batch proposal', () => {
    const result = planVocabulary(parseBulk('be=öl;ol;ÖL;ıl'), [], [{ id: '1:2', action: 'skip' }]);
    expect(result.rows[0]?.meanings[1]?.similarity?.existing).toBe('öl');
    expect(result.changes[0]?.additions.map((meaning) => meaning.turkish)).toEqual(['öl', 'ıl']);
  });
  it('chooses the closest existing spelling with deterministic ties', () => {
    const variants: StoredWord[] = [
      {
        ...stored[0]!,
        meanings: [
          { turkish: 'calismak', normalizedMeaningKey: 'calismak', position: 0 },
          { turkish: 'çalışmak', normalizedMeaningKey: 'çalışmak', position: 1 },
        ],
      },
    ];
    const result = planVocabulary(parseBulk('run=çalişmak'), variants);
    expect(result.rows[0]?.meanings[0]?.similarity?.existing).toBe('çalışmak');
  });
  it('scopes similarity to the same English word, never another word or list', () => {
    expect(planVocabulary(parseBulk('execute=calismak'), stored).unresolvedDecisions).toBe(0);
    expect(planVocabulary(parseBulk('run=calismak'), []).unresolvedDecisions).toBe(0);
  });
  it.each([
    { decisions: [{ id: '2:1', action: 'keep' as const }] },
    {
      decisions: [
        { id: '1:1', action: 'skip' as const },
        { id: '1:1', action: 'keep' as const },
      ],
    },
  ])('rejects choices for unintended or repeated IDs', ({ decisions }) => {
    expect(() => planVocabulary(parseBulk('run=calismak'), stored, decisions)).toThrow(
      'SIMILARITY_DECISION_INVALID',
    );
  });
});
