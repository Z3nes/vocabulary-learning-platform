import type { CompletionInput } from '../src/games/input.js';
import type { SessionView } from '../src/study/view.js';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { createDatabase } from '../src/db/client.js';
import { resolveUser } from '../src/auth/identity.js';
import { loadLocalEnvironment, verifyTestDatabase } from './databaseSafety.js';
import { testConfig } from './helpers.js';
import { completeGame } from '../src/games/service.js';
import { completionSchema } from '../src/games/input.js';
import type { Prisma, PrismaClient } from '../src/generated/prisma/client.js';

interface TestBody {
  game: { id: string; items: CompletionInput['items'] };
  applied: boolean;
  activities: { kind: string; game: { listTitle: string; items: CompletionInput['items'] } }[];
  session: SessionView;
  total: number;
  words: { wordId: string; knownStreak: number; activeSessionId: string | null }[];
}
loadLocalEnvironment();
const targets = await verifyTestDatabase();
const db = createDatabase(targets.runtime);
const identities = [0, 1].map(() => ({ provider: 'test', subject: `games-${randomUUID()}` }));
const users: string[] = [];
let app: FastifyInstance;
let listId: string;
let wordId: string;
let foreignWord: string;
const payload = () => ({
  completionId: randomUUID(),
  listId,
  gameType: 'quiz',
  status: 'completed',
  items: [{ wordId, english: 'apple', meanings: ['elma'], outcome: 'correct', attempts: 1 }],
});
const send = (body: unknown) =>
  app.inject({ method: 'POST', url: '/api/games/completions', payload: body as object });
beforeAll(async () => {
  await db.completedGame.count();
  for (const identity of identities) users.push(await resolveUser(db, identity));
  listId = (await db.wordList.create({ data: { ownerId: users[0]!, title: 'Game fixture' } })).id;
  wordId = (
    await db.word.create({
      data: {
        wordListId: listId,
        english: 'apple',
        normalizedEnglishKey: 'apple',
        meanings: { create: { turkish: 'elma', normalizedMeaningKey: 'elma', position: 0 } },
      },
    })
  ).id;
  const foreignList = await db.wordList.create({
    data: { ownerId: users[1]!, title: 'Foreign fixture' },
  });
  foreignWord = (
    await db.word.create({
      data: { wordListId: foreignList.id, english: 'pear', normalizedEnglishKey: 'pear' },
    })
  ).id;
  app = await buildApp({
    config: testConfig({ databaseUrl: targets.runtime }),
    db,
    logger: false,
    identityProvider: { resolve: () => Promise.resolve(identities[0]!) },
  });
});
afterAll(async () => {
  await app?.close();
  await db.user.deleteMany({ where: { id: { in: users } } });
  await db.$disconnect();
});
describe('completed game persistence', () => {
  it.each([
    { english: 'polysemy', meanings: Array.from({ length: 101 }, (_, i) => `anlam ${i}`) },
    { english: '𐐀'.repeat(80), meanings: ['𐐀'.repeat(100)] },
  ])(
    'persists every meaning and Unicode character accepted by vocabulary entry: $english',
    async (entry) => {
      const fixtureList = await db.wordList.create({
        data: { ownerId: users[0]!, title: 'Vocabulary contract fixture' },
      });
      const submission = { kind: 'single', entry };
      const base = `/api/lists/${fixtureList.id}/words`;
      const preview = await app.inject({
        method: 'POST',
        url: `${base}/preview`,
        payload: submission,
      });
      expect(preview.statusCode).toBe(200);
      const commit = await app.inject({
        method: 'POST',
        url: `${base}/commit`,
        payload: { submission, token: preview.json<{ token: string }>().token },
      });
      expect(commit.statusCode).toBe(200);
      const stored = await db.word.findFirstOrThrow({
        where: { wordListId: fixtureList.id, english: entry.english },
      });
      const response = await send({
        ...payload(),
        listId: fixtureList.id,
        items: [{ wordId: stored.id, ...entry, outcome: 'correct', attempts: 1 }],
      });
      expect(response.statusCode).toBe(200);
      expect(response.json<TestBody>().game.items[0]).toMatchObject(entry);
    },
  );
  it('rolls back a failure after the record has been inserted', async () => {
    const input = completionSchema.parse(payload());
    const failing = {
      $transaction: (operation: (tx: Prisma.TransactionClient) => Promise<unknown>) =>
        db.$transaction(async (tx) => {
          const wrapped = new Proxy(tx, {
            get(target, key, receiver) {
              if (key !== 'completedGame') return Reflect.get(target, key, receiver) as unknown;
              return {
                ...target.completedGame,
                create: async (args: Prisma.CompletedGameCreateArgs) => {
                  await target.completedGame.create(args);
                  throw new Error('Injected failure after insert');
                },
              };
            },
          });
          return operation(wrapped);
        }),
    } as unknown as PrismaClient;
    await expect(completeGame(failing, users[0]!, input)).rejects.toThrow(
      'Injected failure after insert',
    );
    expect(await db.completedGame.count({ where: { completionId: input.completionId } })).toBe(0);
  });
  it('rejects malformed IDs and excessive payload sizes', async () => {
    expect((await send({ ...payload(), completionId: 'bad' })).statusCode).toBe(400);
    expect(
      (
        await send({
          ...payload(),
          items: [{ ...payload().items[0], english: 'x'.repeat(300000) }],
        })
      ).statusCode,
    ).toBe(413);
  });
  it('rejects a foreign source list', async () => {
    const foreignList = await db.wordList.findFirstOrThrow({ where: { ownerId: users[1]! } });
    expect((await send({ ...payload(), listId: foreignList.id })).statusCode).toBe(404);
  });
  it('stores snapshots without changing mastery', async () => {
    const response = await send(payload());
    expect(response.statusCode).toBe(200);
    expect(response.json<TestBody>().game.items[0]!.meanings).toEqual(['elma']);
    expect(await db.wordProgress.findUnique({ where: { wordId } })).toBeNull();
  });
  it('replays identical requests and conflicts on different content', async () => {
    const input = payload();
    const first = await send(input);
    const retry = await send(input);
    expect(retry.json<TestBody>().game.id).toBe(first.json<TestBody>().game.id);
    expect(retry.json<TestBody>().applied).toBe(false);
    expect(
      (await send({ ...input, items: [{ ...input.items[0], english: 'changed' }] })).statusCode,
    ).toBe(409);
  });
  it('serializes concurrent duplicate requests', async () => {
    const input = payload();
    const responses = await Promise.all([send(input), send(input)]);
    expect(responses.map((r) => r.statusCode)).toEqual([200, 200]);
    expect(await db.completedGame.count({ where: { completionId: input.completionId } })).toBe(1);
  });
  it('rejects foreign words atomically', async () => {
    const input = payload();
    input.items[0]!.wordId = foreignWord;
    expect((await send(input)).statusCode).toBe(404);
    expect(await db.completedGame.count({ where: { completionId: input.completionId } })).toBe(0);
  });
  it('rejects another owned list’s word', async () => {
    const list = await db.wordList.create({ data: { ownerId: users[0]!, title: 'Other' } });
    const input = { ...payload(), listId: list.id };
    expect((await send(input)).statusCode).toBe(404);
  });
  it('retains deleted source text with a null reference', async () => {
    const input = payload();
    input.items[0]!.wordId = randomUUID();
    const result = await send(input);
    expect(result.statusCode).toBe(200);
    expect(result.json<TestBody>().game.items[0]).toMatchObject({ wordId: null, english: 'apple' });
    expect((await send(input)).json<TestBody>().applied).toBe(false);
  });
  it('cascades list deletion', async () => {
    const list = await db.wordList.create({ data: { ownerId: users[0]!, title: 'Disposable' } });
    const input = {
      ...payload(),
      listId: list.id,
      items: [{ ...payload().items[0]!, wordId: null }],
    };
    expect((await send(input)).statusCode).toBe(200);
    await db.wordList.delete({ where: { id: list.id } });
    expect(await db.completedGame.count({ where: { completionId: input.completionId } })).toBe(0);
  });
  it('rejects unauthenticated requests', async () => {
    const anonymous = await buildApp({ config: testConfig(), logger: false });
    expect(
      (
        await anonymous.inject({
          method: 'POST',
          url: '/api/games/completions',
          payload: payload(),
        })
      ).statusCode,
    ).toBe(401);
    await anonymous.close();
  });
  it('isolates combined history and preserves snapshots', async () => {
    const foreign = await db.wordList.findFirstOrThrow({ where: { ownerId: users[1]! } });
    await db.completedGame.create({
      data: {
        ownerId: users[1]!,
        completionId: randomUUID(),
        wordListId: foreign.id,
        listTitle: 'Private',
        gameType: 'quiz',
        requestHash: 'x',
        items: [
          { english: 'pear', meanings: ['armut'], wordId: null, outcome: 'correct', attempts: 1 },
        ],
      },
    });
    const response = await app.inject('/api/activity');
    expect(response.statusCode).toBe(200);
    const activities = response.json<TestBody>().activities;
    expect(activities.length).toBeGreaterThan(0);
    expect(
      activities.every((row: { game: { listTitle: string } }) => row.game.listTitle !== 'Private'),
    ).toBe(true);
    expect(activities[0]!.game.items[0]!.english).toBe('apple');
  });
  it('exposes authoritative review across directions and separate sessions; games never change it', async () => {
    async function evaluate(action: string, direction = 'en-tr') {
      const started = await app.inject({
        method: 'POST',
        url: `/api/lists/${listId}/study-sessions`,
        payload: { percentage: 100, direction },
      });
      expect(started.statusCode).toBe(201);
      let session = started.json<TestBody>().session;
      const response = await app.inject({
        method: 'POST',
        url: `/api/study-sessions/${session.id}/actions`,
        payload: { cardId: session.currentCard!.id, version: session.version, action },
      });
      expect(response.statusCode).toBe(200);
      session = response.json<TestBody>().session;
      return session;
    }
    await evaluate('missed');
    let review = (await app.inject('/api/review')).json<TestBody>();
    expect(review.words[0]).toMatchObject({ wordId, knownStreak: 0, listId, meanings: ['elma'] });
    await evaluate('known', 'tr-en');
    review = (await app.inject('/api/review')).json<TestBody>();
    expect(review.words[0]!.knownStreak).toBe(1);
    await send(payload());
    expect((await app.inject('/api/review')).json<TestBody>().words[0]!.knownStreak).toBe(1);
    await evaluate('known');
    expect((await app.inject('/api/review')).json<TestBody>().total).toBe(0);
    expect(
      (await app.inject('/api/activity'))
        .json<TestBody>()
        .activities.some((row: { kind: string }) => row.kind === 'flashcard'),
    ).toBe(true);
  });
  it('provides resume metadata and keeps Skip/Remove neutral', async () => {
    await db.wordProgress.upsert({
      where: { wordId },
      create: { wordId, needsReview: true },
      update: { needsReview: true, knownStreak: 0 },
    });
    const started = await app.inject({
      method: 'POST',
      url: `/api/lists/${listId}/study-sessions`,
      payload: { percentage: 100, direction: 'en-tr' },
    });
    const session = started.json<TestBody>().session;
    expect((await app.inject('/api/review')).json<TestBody>().words[0]!.activeSessionId).toBe(
      session.id,
    );
    for (const [version, action] of [
      [0, 'skip'],
      [1, 'remove'],
    ] as const) {
      expect(
        (
          await app.inject({
            method: 'POST',
            url: `/api/study-sessions/${session.id}/actions`,
            payload: { cardId: session.currentCard!.id, version, action },
          })
        ).statusCode,
      ).toBe(200);
    }
    expect((await app.inject('/api/review')).json<TestBody>().words[0]!.knownStreak).toBe(0);
  });
  it('rejects invalid review cursors and isolates review ownership', async () => {
    expect((await app.inject('/api/review?after=bad')).statusCode).toBe(400);
    const other = await buildApp({
      config: testConfig({ databaseUrl: targets.runtime }),
      db,
      logger: false,
      identityProvider: { resolve: () => Promise.resolve(identities[1]!) },
    });
    expect((await other.inject('/api/review')).json<TestBody>()).toMatchObject({
      evaluatedCount: 0,
      total: 0,
      words: [],
    });
    await other.close();
  });
});
