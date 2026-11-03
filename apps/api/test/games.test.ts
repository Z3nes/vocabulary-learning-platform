import { describe, expect, it } from 'vitest';
import { completionSchema } from '../src/games/input.js';

const item = {
  wordId: '00000000-0000-4000-8000-000000000001',
  english: 'apple',
  meanings: ['elma'],
  outcome: 'correct',
  attempts: 1,
};
const input = {
  completionId: '00000000-0000-4000-8000-000000000002',
  listId: '00000000-0000-4000-8000-000000000003',
  gameType: 'quiz',
  status: 'completed',
  items: [item],
};
describe('completed game validation', () => {
  it.each(['quiz', 'matching', 'memory', 'assembly'])(
    'accepts the bounded outcome contract for %s',
    (gameType) => {
      const outcome =
        gameType === 'quiz' ? 'incorrect' : gameType === 'assembly' ? 'revealed' : 'matched';
      const items =
        gameType === 'matching' || gameType === 'memory'
          ? [
              { ...item, outcome },
              { ...item, wordId: null, english: 'pear', outcome },
            ]
          : [{ ...item, outcome }];
      expect(completionSchema.safeParse({ ...input, gameType, items }).success).toBe(true);
    },
  );
  it('accepts a completed quiz and deleted source word', () => {
    expect(completionSchema.safeParse(input).success).toBe(true);
    expect(
      completionSchema.safeParse({ ...input, items: [{ ...item, wordId: null }] }).success,
    ).toBe(true);
  });
  it.each([
    { completionId: 'invalid' },
    { listId: 'invalid' },
    { gameType: 'unknown' },
    { status: 'active' },
    { items: [] },
    { items: Array(11).fill(item) },
    { items: [{ ...item, english: 'x'.repeat(121) }] },
    { items: [{ ...item, meanings: ['x'.repeat(161)] }] },
    { items: [{ ...item, meanings: [] }] },
    { items: [{ ...item, attempts: 10001 }] },
    { items: [{ ...item, attempts: -1 }] },
    { items: [{ ...item, outcome: 'matched' }] },
    { items: [item, item] },
    { gameType: 'matching' },
    { items: [{ ...item, extra: 'bad' }] },
    { ownerId: item.wordId },
  ])('rejects invalid or excessive input %j', (change) => {
    expect(completionSchema.safeParse({ ...input, ...change }).success).toBe(false);
  });
});
