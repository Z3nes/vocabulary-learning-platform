import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '../src/generated/prisma/client.js';
import { completeGame } from '../src/games/service.js';
import type { CompletionInput } from '../src/games/input.js';

const input: CompletionInput = {
  completionId: 'completion',
  listId: 'list',
  gameType: 'quiz',
  status: 'completed',
  items: [
    {
      wordId: 'word',
      english: 'old snapshot',
      meanings: ['eski anlam'],
      outcome: 'incorrect',
      attempts: 1,
    },
  ],
};
function fixture() {
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([{ id: 'list' }]),
    $executeRaw: vi.fn().mockResolvedValue(1),
    completedGame: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: 'game' }),
    },
    wordList: { findFirstOrThrow: vi.fn().mockResolvedValue({ title: 'List title' }) },
    word: {
      findMany: vi
        .fn()
        .mockResolvedValue([{ id: 'word', wordListId: 'list', wordList: { ownerId: 'owner' } }]),
    },
  };
  const run = vi.fn((operation: (connection: typeof tx) => Promise<unknown>) => operation(tx));
  return { tx, run, db: { $transaction: run } as unknown as PrismaClient };
}
describe('game persistence orchestration (mocked transaction, not real lock evidence)', () => {
  it('locks completion identity then owned list before reading', async () => {
    const { tx, db, run } = fixture();
    await completeGame(db, 'owner', input);
    expect(run).toHaveBeenCalledOnce();
    expect(tx.$executeRaw.mock.calls[0]?.slice(1)).toEqual(['owner:completion']);
    expect(tx.$queryRaw.mock.calls[0]?.slice(1)).toEqual(['list', 'owner']);
    expect(tx.completedGame.findUnique).toHaveBeenCalledWith({
      where: { ownerId_completionId: { ownerId: 'owner', completionId: 'completion' } },
    });
  });
  it('stores displayed snapshots, server owner and list title', async () => {
    const { tx, db } = fixture();
    await completeGame(db, 'owner', input);
    expect(tx.completedGame.create.mock.calls[0]?.[0]).toMatchObject({
      data: { ownerId: 'owner', wordListId: 'list', listTitle: 'List title', items: input.items },
    });
  });
  it('nulls missing source IDs while keeping their displayed text', async () => {
    const { tx, db } = fixture();
    tx.word.findMany.mockResolvedValue([]);
    await completeGame(db, 'owner', input);
    expect(tx.completedGame.create.mock.calls[0]?.[0]).toMatchObject({
      data: { items: [{ ...input.items[0], wordId: null }] },
    });
  });
  it.each([
    { id: 'word', wordListId: 'foreign', wordList: { ownerId: 'owner' } },
    { id: 'word', wordListId: 'list', wordList: { ownerId: 'foreign' } },
  ])('rejects mismatching list/owner before writing %j', async (word) => {
    const { tx, db } = fixture();
    tx.word.findMany.mockResolvedValue([word]);
    await expect(completeGame(db, 'owner', input)).rejects.toMatchObject({
      status: 404,
      code: 'WORD_NOT_FOUND',
    });
    expect(tx.completedGame.create).not.toHaveBeenCalled();
  });
  it('replays matching payloads without revalidating deleted source words', async () => {
    const { tx, db } = fixture();
    tx.completedGame.findUnique.mockResolvedValue({
      id: 'existing',
      requestHash: createHash('sha256').update(JSON.stringify(input)).digest('hex'),
    });
    expect(await completeGame(db, 'owner', input)).toMatchObject({
      applied: false,
      game: { id: 'existing' },
    });
    expect(tx.word.findMany).not.toHaveBeenCalled();
    expect(tx.completedGame.create).not.toHaveBeenCalled();
  });
  it('does not overwrite conflicts', async () => {
    const { tx, db } = fixture();
    tx.completedGame.findUnique.mockResolvedValue({ requestHash: 'different' });
    await expect(completeGame(db, 'owner', input)).rejects.toMatchObject({
      status: 409,
      code: 'GAME_COMPLETION_CONFLICT',
    });
    expect(tx.completedGame.create).not.toHaveBeenCalled();
  });
  it('rejects unowned lists at the lock boundary', async () => {
    const { tx, db } = fixture();
    tx.$queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    await expect(completeGame(db, 'owner', input)).rejects.toMatchObject({
      code: 'LIST_NOT_FOUND',
    });
    expect(tx.completedGame.create).not.toHaveBeenCalled();
  });
  it('propagates write failure through the single transaction', async () => {
    const { tx, db } = fixture();
    tx.completedGame.create.mockRejectedValue(new Error('Fixture failure'));
    await expect(completeGame(db, 'owner', input)).rejects.toThrow('Fixture failure');
  });
});
