import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import { resolveUser } from '../src/auth/identity.js';
import { createDatabase } from '../src/db/client.js';
import { ExampleService } from '../src/examples/service.js';
import { startSession } from '../src/study/service.js';
import { loadLocalEnvironment, verifyTestDatabase } from './databaseSafety.js';
import { testConfig } from './helpers.js';

loadLocalEnvironment();
const targets = await verifyTestDatabase();
const db = createDatabase(targets.runtime);
const subjects = [`examples-${randomUUID()}-A`, `examples-${randomUUID()}-B`];
const identity = (index: number) => ({ provider: 'test', subject: subjects[index]! });
const users: string[] = [];
const apps: FastifyInstance[] = [];
const candidates = vi.fn().mockResolvedValue([]);
const service = new ExampleService({ candidates });
let listId: string;
let wordId: string;
let sessionId: string;
let cardId: string;
const wordUrl = () => `/api/lists/${listId}/words/${wordId}/examples`;
const cardUrl = () => `/api/study-sessions/${sessionId}/cards/${cardId}/examples`;

beforeAll(async () => {
  await db.studyCard.count();
  for (const index of [0, 1]) {
    users.push(await resolveUser(db, identity(index)));
    apps.push(
      await buildApp({
        config: testConfig({ databaseUrl: targets.runtime, exampleSentencesEnabled: true }),
        db,
        examples: service,
        identityProvider: { resolve: () => Promise.resolve(identity(index)) },
        logger: false,
      }),
    );
  }
  const list = await db.wordList.create({
    data: {
      ownerId: users[0]!,
      title: 'Example integration fixture',
      words: {
        create: {
          english: 'run',
          normalizedEnglishKey: 'run',
          meanings: { create: { turkish: 'koşmak', normalizedMeaningKey: 'koşmak', position: 0 } },
        },
      },
    },
    include: { words: true },
  });
  listId = list.id;
  wordId = list.words[0]!.id;
  const session = await startSession(db, users[0]!, listId, {
    percentage: 100,
    direction: 'tr-en',
  });
  sessionId = session.id;
  cardId = session.currentCard!.id;
}, 20_000);
afterAll(async () => {
  await Promise.all(apps.map((app) => app.close()));
  // Cleanup is constrained to this run's unique identities after safety verification.
  const owned = await db.userIdentity.findMany({
    where: { provider: 'test', subject: { in: subjects } },
    select: { userId: true },
  });
  await db.user.deleteMany({ where: { id: { in: owned.map((row) => row.userId) } } });
  await db.$disconnect();
});
describe('examples ownership with real PostgreSQL and mocked provider', () => {
  it('authorizes a saved word but blocks a foreign word/list even with a warm pool', async () => {
    expect((await apps[0]!.inject(wordUrl())).statusCode).toBe(200);
    const count = candidates.mock.calls.length;
    expect((await apps[1]!.inject(wordUrl())).statusCode).toBe(404);
    expect(candidates).toHaveBeenCalledTimes(count);
  });
  it('does not allow a guessed foreign list id combined with an owned word', async () => {
    const list = await db.wordList.create({
      data: { ownerId: users[1]!, title: 'Foreign fixture' },
    });
    expect(
      (await apps[0]!.inject(`/api/lists/${list.id}/words/${wordId}/examples`)).statusCode,
    ).toBe(404);
  });
  it('uses the immutable card English after source editing', async () => {
    await db.word.update({
      where: { id: wordId },
      data: { english: 'edited', normalizedEnglishKey: 'edited' },
    });
    const lookup = vi.spyOn(service, 'lookup');
    expect((await apps[0]!.inject(cardUrl())).statusCode).toBe(200);
    expect(lookup).toHaveBeenCalledWith('run', []);
    lookup.mockRestore();
  });
  it('rejects foreign sessions and cards attached to the wrong session', async () => {
    expect((await apps[1]!.inject(cardUrl())).statusCode).toBe(404);
    expect(
      (await apps[0]!.inject(`/api/study-sessions/${randomUUID()}/cards/${cardId}/examples`))
        .statusCode,
    ).toBe(404);
  });
  it('supports a deleted source snapshot and leaves queue, version and mastery unchanged', async () => {
    await db.word.delete({ where: { id: wordId } });
    const before = await db.studySession.findUnique({
      where: { id: sessionId },
      include: { cards: true },
    });
    expect(before?.cards[0]?.wordId).toBeNull();
    expect((await apps[0]!.inject(cardUrl())).statusCode).toBe(200);
    const after = await db.studySession.findUnique({
      where: { id: sessionId },
      include: { cards: true },
    });
    expect(after).toEqual(before);
    expect(
      await db.wordProgress.count({ where: { word: { wordList: { ownerId: users[0]! } } } }),
    ).toBe(0);
    expect((await apps[0]!.inject(wordUrl())).statusCode).toBe(404);
  });
  it('does not expose examples for an ended session', async () => {
    await db.studySession.update({
      where: { id: sessionId },
      data: { status: 'ENDED_EARLY', activeListId: null, finishedAt: new Date() },
    });
    expect((await apps[0]!.inject(cardUrl())).statusCode).toBe(404);
  });
});
