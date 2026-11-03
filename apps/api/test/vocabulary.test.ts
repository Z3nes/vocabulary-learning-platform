import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  displayText,
  editSchema,
  englishKey,
  meaningKey,
  parseBulk,
  parseEntry,
  parseSubmission,
} from '../src/vocabulary/input.js';
import { planVocabulary, type StoredWord } from '../src/vocabulary/plan.js';

const existing: StoredWord[] = [
  {
    id: 'word',
    english: 'Run',
    normalizedEnglishKey: 'run',
    meanings: [{ turkish: 'koşmak', normalizedMeaningKey: 'koşmak', position: 0 }],
  },
];
describe('shared vocabulary normalization and validation', () => {
  it('normalizes NFC and internal whitespace while preserving display apostrophes', () => {
    expect(displayText('  cafe\u0301  au\t lait  ')).toBe('café au lait');
    expect(parseEntry({ english: ' don’t ', meanings: ['  I\u0307Ş  '] }).entries[0]).toMatchObject(
      { english: 'don’t', key: "don't", meanings: [{ turkish: 'İŞ', key: 'iş' }] },
    );
  });
  it.each(['run', 'Run', 'RUN'])('uses English case folding for %s', (value) =>
    expect(englishKey(value)).toBe('run'),
  );
  it('handles English I independently of host Turkish locale', () =>
    expect(englishKey('INPUT')).toBe('input'));
  it('does not use argument-less locale casing', () => {
    expect(
      readFileSync(new URL('../src/vocabulary/input.ts', import.meta.url), 'utf8'),
    ).not.toMatch(/toLocaleLowerCase\(\s*\)/u);
  });
  it.each(["don't", 'don’t', 'don‘t', 'donʼt'])('folds apostrophe %s only in keys', (value) =>
    expect(englishKey(value)).toBe("don't"),
  );
  it('supports phrases and Unicode English display text', () => {
    expect(englishKey(' BINARY  search ')).toBe('binary search');
    expect(parseEntry({ english: 'café', meanings: ['kafe'] }).invalid).toEqual([]);
  });
  it('distinguishes Turkish dotted and dotless I', () => {
    expect(meaningKey('ISITMA')).toBe('ısıtma');
    expect(meaningKey('İSİM')).toBe('isim');
    expect(meaningKey('I')).not.toBe(meaningKey('İ'));
  });
  it.each([
    [{ english: '', meanings: ['a'] }, 'WORD_REQUIRED'],
    [{ english: ' \t ', meanings: ['a'] }, 'WORD_REQUIRED'],
    [{ english: 'a'.repeat(121), meanings: ['a'] }, 'WORD_TOO_LONG'],
    [{ english: 'a', meanings: [] }, 'MEANING_REQUIRED'],
    [{ english: 'a', meanings: ['  '] }, 'MEANING_REQUIRED'],
    [{ english: 'a', meanings: ['ş'.repeat(161)] }, 'MEANING_TOO_LONG'],
  ])('rejects invalid normalized values', (entry, code) =>
    expect(parseEntry(entry).invalid[0]?.codes).toContain(code),
  );
  it('validates length after normalization, counting Unicode code points', () => {
    expect(
      parseEntry({ english: ` ${'𐐀'.repeat(120)} `, meanings: ['ş'.repeat(160)] }).invalid,
    ).toEqual([]);
  });
  it('requires a complete nonempty meaning set and rejects normalized editing duplicates', () => {
    expect(editSchema.safeParse({ english: 'run', meanings: ['İŞ', ' iş '] }).success).toBe(false);
    expect(editSchema.safeParse({ english: 'run', meanings: [] }).success).toBe(false);
    expect(editSchema.safeParse({ english: 'run', meanings: ['I', 'İ'] }).success).toBe(true);
  });
});
describe('bulk parser', () => {
  it('supports CRLF, blank lines, first separators, semicolons and source lines', () => {
    const input = parseBulk('\r\napple\telma\r\n\nrun = koşmak; çalıştırmak\nformula\tx=y');
    expect(input.invalid).toEqual([]);
    expect(input.entries.map((entry) => entry.line)).toEqual([2, 4, 5]);
    expect(input.entries[1]?.meanings).toHaveLength(2);
    expect(input.entries[2]?.meanings[0]?.turkish).toBe('x=y');
  });
  it('preserves commas and hyphens; provides a nonblocking comma hint', () => {
    const input = parseBulk('well-being = sağlık, esenlik');
    expect(input.entries[0]).toMatchObject({
      english: 'well-being',
      meanings: [{ turkish: 'sağlık, esenlik' }],
      warnings: ['COMMA_HINT'],
    });
  });
  it.each(['a\tb\tc', 'a=b\tc', 'run - koşmak', 'bad line', '=anlam', 'run=', 'run=a;;b', '   '])(
    'rejects malformed input %s',
    (text) => expect(parseBulk(text).invalid.length).toBeGreaterThan(0),
  );
  it('enforces physical line count including blanks', () => {
    expect(() => parseBulk('a=b\n'.repeat(500))).toThrow('BULK_TOO_MANY_LINES');
    expect(parseBulk(Array.from({ length: 500 }, () => 'a=b').join('\n')).invalid).toEqual([]);
  });
  it('enforces UTF-8 byte size, including multibyte Turkish text', () => {
    expect(() => parseBulk('ş'.repeat(51_201))).toThrow('BULK_TOO_LARGE');
    expect(() => parseBulk('a'.repeat(102_401))).toThrow('BULK_TOO_LARGE');
    expect(() => parseBulk('a'.repeat(102_400))).not.toThrow();
  });
});
describe('one shared merge planner for single and bulk submissions', () => {
  it.each([
    ['apple', ['elma'], []],
    ['run', ['çalıştırmak'], existing],
    ['run', ['koşmak'], existing],
    ['run', ['koşmak', 'çalıştırmak'], existing],
  ])('makes equivalent decisions for %s', (english, meanings, stored) => {
    const single = planVocabulary(
      parseSubmission({ kind: 'single', entry: { english, meanings } }),
      stored,
    );
    const bulk = planVocabulary(
      parseSubmission({ kind: 'bulk', text: `${english}=${meanings.join(';')}` }),
      stored,
    );
    expect(single).toEqual(bulk);
  });
  it('plans new words, merges, skips and repeated batch meanings accurately', () => {
    const plan = planVocabulary(
      parseBulk('run=koşmak\nrun=çalıştırmak\nrun=koşmak\napple=elma\nApple=elma;meyve'),
      existing,
    );
    expect(plan.rows.map((row) => row.status)).toEqual([
      'duplicate',
      'merge',
      'duplicate',
      'new',
      'batch_merge',
    ]);
    expect(plan.counts).toEqual({
      newWords: 1,
      mergedWords: 1,
      newMeanings: 3,
      skippedMeanings: 3,
      duplicateEntries: 2,
    });
    expect(plan.changes).toHaveLength(2);
    expect(plan.rows[4]?.meanings[0]?.status).toBe('repeated');
  });
  it('treats exact duplicates as valid no-ops', () => {
    const plan = planVocabulary(parseBulk('RUN=koşmak'), existing);
    expect(plan.invalid).toEqual([]);
    expect(plan.canCommit).toBe(false);
    expect(plan.changes).toEqual([]);
  });
  it('does not merge across lists (only supplied owned list state participates)', () => {
    expect(planVocabulary(parseBulk('run=koşmak'), []).counts.newWords).toBe(1);
  });
  it('blocks a whole malformed batch while still explaining valid rows', () => {
    const plan = planVocabulary(parseBulk('apple=elma\n=eksik'), []);
    expect(plan.canCommit).toBe(false);
    expect(plan.rows).toHaveLength(1);
    expect(plan.invalid).toEqual([{ line: 2, codes: ['WORD_REQUIRED'] }]);
  });
});
