import { describe, expect, it, vi } from 'vitest';
import { Prisma, type PrismaClient } from '../src/generated/prisma/client.js';
import { processVocabulary } from '../src/vocabulary/service.js';
import type { Submission } from '../src/vocabulary/input.js';

// These are orchestration tests only; real transaction/locking evidence belongs to integration tests.
function fixture() {
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([{ id: 'list' }]),
    $executeRaw: vi.fn().mockResolvedValue(1),
    word: {
      findMany: vi.fn().mockResolvedValue([]),
      createMany: vi.fn().mockResolvedValue({ count: 1 }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    wordMeaning: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
  };
  const run = vi.fn((operation: (connection: typeof tx) => Promise<unknown>) => operation(tx));
  const db = { $transaction: run } as unknown as PrismaClient;
  return { tx, db, run };
}
const input: Submission = { kind: 'single', entry: { english: ' Run ', meanings: [' koşmak '] } };
const stored = {
  id: 'word',
  english: 'run',
  normalizedEnglishKey: 'run',
  createdAt: new Date(0),
  updatedAt: new Date(0),
  meanings: [{ id: 'meaning', turkish: 'koşmak', normalizedMeaningKey: 'koşmak', position: 0 }],
};

describe('shared preview/commit orchestration with a mocked transaction', () => {
  it('previews without writes and locks the owned parent before reading', async () => {
    const { tx, db } = fixture();
    const preview = await processVocabulary(db, 'owner', 'list', input);
    expect(preview.counts).toMatchObject({ newWords: 1, newMeanings: 1 });
    expect(tx.$queryRaw.mock.calls[0]?.slice(1)).toEqual(['list', 'owner']);
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      tx.word.findMany.mock.invocationCallOrder[0]!,
    );
    expect(tx.word.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          wordListId: 'list',
          wordList: { ownerId: 'owner' },
          normalizedEnglishKey: { in: ['run'] },
        },
      }),
    );
    expect(tx.word.createMany).not.toHaveBeenCalled();
    expect(tx.wordMeaning.createMany).not.toHaveBeenCalled();
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });
  it('commits only revalidated planned changes and returns actual accounting', async () => {
    const { tx, db } = fixture();
    const preview = await processVocabulary(db, 'owner', 'list', input);
    const result = await processVocabulary(db, 'owner', 'list', input, preview.token);
    expect(result).toMatchObject({ changed: true, counts: { newWords: 1, newMeanings: 1 } });
    expect(tx.word.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          wordListId: 'list',
          english: 'Run',
          normalizedEnglishKey: 'run',
        }),
      ],
    });
    expect(tx.wordMeaning.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({ turkish: 'koşmak', normalizedMeaningKey: 'koşmak', position: 0 }),
      ],
    });
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
  });
  it('uses the same commit result for equivalent single and bulk input', async () => {
    const first = fixture();
    const second = fixture();
    const bulk: Submission = { kind: 'bulk', text: ' Run = koşmak ' };
    const p1 = await processVocabulary(first.db, 'owner', 'list', input);
    const p2 = await processVocabulary(second.db, 'owner', 'list', bulk);
    expect(p1).toEqual(p2);
    const c1 = await processVocabulary(first.db, 'owner', 'list', input, p1.token);
    const c2 = await processVocabulary(second.db, 'owner', 'list', bulk, p2.token);
    expect(c1).toEqual(c2);
  });
  it('merges only new meanings, preserving existing display text and appending ordered meanings', async () => {
    const { tx, db } = fixture();
    tx.word.findMany.mockResolvedValue([stored]);
    const merge: Submission = {
      kind: 'single',
      entry: { english: 'RUN', meanings: ['koşmak', 'çalıştırmak', 'çalıştırmak'] },
    };
    const preview = await processVocabulary(db, 'owner', 'list', merge);
    const result = await processVocabulary(db, 'owner', 'list', merge, preview.token);
    expect(result.counts).toMatchObject({ mergedWords: 1, newMeanings: 1, skippedMeanings: 2 });
    expect(tx.word.createMany).not.toHaveBeenCalled();
    expect(tx.wordMeaning.createMany).toHaveBeenCalledWith({
      data: [
        {
          wordId: 'word',
          turkish: 'çalıştırmak',
          normalizedMeaningKey: 'çalıştırmak',
          position: 1,
        },
      ],
    });
    expect(tx.word.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
  });
  it('keeps exact duplicates as no-ops without word or list timestamp writes', async () => {
    const { tx, db } = fixture();
    tx.word.findMany.mockResolvedValue([stored]);
    const preview = await processVocabulary(db, 'owner', 'list', input);
    const result = await processVocabulary(db, 'owner', 'list', input, preview.token);
    expect(result).toMatchObject({ changed: false });
    for (const write of [
      tx.word.createMany,
      tx.word.updateMany,
      tx.wordMeaning.createMany,
      tx.$executeRaw,
    ])
      expect(write).not.toHaveBeenCalled();
  });
  it('rejects stale state, input tampering and receipt reuse across lists or owners', async () => {
    const { tx, db } = fixture();
    const preview = await processVocabulary(db, 'owner', 'list', input);
    for (const [owner, list] of [
      ['other', 'list'],
      ['owner', 'other'],
    ])
      await expect(
        processVocabulary(db, owner!, list!, input, preview.token),
      ).rejects.toMatchObject({ code: 'PREVIEW_STALE' });
    await expect(
      processVocabulary(db, 'owner', 'list', { kind: 'bulk', text: 'run=başka' }, preview.token),
    ).rejects.toMatchObject({ code: 'PREVIEW_STALE' });
    tx.word.findMany.mockResolvedValue([stored]);
    await expect(
      processVocabulary(db, 'owner', 'list', input, preview.token),
    ).rejects.toMatchObject({ code: 'PREVIEW_STALE' });
    expect(tx.word.createMany).not.toHaveBeenCalled();
  });
  it('refuses missing or foreign owned lists before any word reads', async () => {
    const { tx, db } = fixture();
    tx.$queryRaw.mockResolvedValue([]);
    await expect(processVocabulary(db, 'owner', 'list', input)).rejects.toMatchObject({
      status: 404,
      code: 'LIST_NOT_FOUND',
    });
    expect(tx.word.findMany).not.toHaveBeenCalled();
  });
  it('invalidates approval after a unique-constraint race and replans in a fresh transaction', async () => {
    const { tx, db, run } = fixture();
    const preview = await processVocabulary(db, 'owner', 'list', input);
    tx.word.createMany.mockImplementationOnce(() => {
      tx.word.findMany.mockResolvedValue([stored]);
      return Promise.reject(
        new Prisma.PrismaClientKnownRequestError('Simulated unique race', {
          code: 'P2002',
          clientVersion: '7.10.1',
        }),
      );
    });
    await expect(
      processVocabulary(db, 'owner', 'list', input, preview.token),
    ).rejects.toMatchObject({ code: 'PREVIEW_STALE' });
    expect(run).toHaveBeenCalledTimes(3);
    expect(tx.wordMeaning.createMany).not.toHaveBeenCalled();
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });
  it('refuses to commit any valid rows if malformed rows remain', async () => {
    const { tx, db } = fixture();
    const invalid: Submission = { kind: 'bulk', text: 'apple=elma\nbad line' };
    const preview = await processVocabulary(db, 'owner', 'list', invalid);
    expect(preview.canCommit).toBe(false);
    await expect(
      processVocabulary(db, 'owner', 'list', invalid, preview.token),
    ).rejects.toMatchObject({ code: 'BULK_INVALID_CONTENT' });
    expect(tx.word.createMany).not.toHaveBeenCalled();
  });
  it('batches a 500-word commit with one parent timestamp update', async () => {
    const { tx, db } = fixture();
    const batch: Submission = {
      kind: 'bulk',
      text: Array.from({ length: 500 }, (_, index) => `word ${index}=anlam`).join('\n'),
    };
    const preview = await processVocabulary(db, 'owner', 'list', batch);
    const result = await processVocabulary(db, 'owner', 'list', batch, preview.token);
    expect(result.counts.newWords).toBe(500);
    expect(tx.word.createMany).toHaveBeenCalledTimes(1);
    expect(tx.wordMeaning.createMany).toHaveBeenCalledTimes(1);
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
  });
});
