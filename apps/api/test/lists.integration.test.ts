import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { resolveUser } from '../src/auth/identity.js';
import { createDatabase } from '../src/db/client.js';
import { loadLocalEnvironment, verifyTestDatabase } from './databaseSafety.js';
import { testConfig } from './helpers.js';

loadLocalEnvironment();
const targets = await verifyTestDatabase();
const db = createDatabase(targets.runtime);
const run = randomUUID();
const subjects = ['A', 'B', 'concurrent', 'cascade'].map((name) => `${run}-${name}`);
const identity = (index: number) => ({ provider: 'test', subject: subjects[index]! });
const ownedUsers: string[] = [];
let a: FastifyInstance;
let b: FastifyInstance;

interface ListResponse {
  list: { id: string; title: string; createdAt: string; updatedAt: string; wordCount: number };
}
interface ListsResponse {
  lists: ListResponse['list'][];
}

beforeAll(async () => {
  // Migration applicability is established by the safety-checked migrate/deploy command.
  // Tests additionally require the real migration ledger and application schema.
  const migrations = await db.$queryRaw<{ count: bigint }[]>`
    SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`;
  expect(Number(migrations[0]?.count)).toBeGreaterThan(0);
  for (const index of [0, 1]) ownedUsers.push(await resolveUser(db, identity(index)));
  const config = testConfig({ databaseUrl: targets.runtime });
  a = await buildApp({
    config,
    db,
    logger: false,
    identityProvider: { resolve: () => Promise.resolve(identity(0)) },
  });
  b = await buildApp({
    config,
    db,
    logger: false,
    identityProvider: { resolve: () => Promise.resolve(identity(1)) },
  });
}, 20_000);

afterAll(async () => {
  await a?.close();
  await b?.close();
  // Bounded cleanup: only identities generated for THIS run, never truncate/reset.
  const users = await db.userIdentity.findMany({
    where: { provider: 'test', subject: { in: subjects } },
    select: { userId: true },
  });
  await db.user.deleteMany({ where: { id: { in: users.map((user) => user.userId) } } });
  await db.$disconnect();
});

describe('personal lists against real PostgreSQL', () => {
  it('creates, reads from another connection, renames, and deletes a persistent list', async () => {
    const created = await a.inject({
      method: 'POST',
      url: '/api/lists',
      payload: { title: '  Veri Yapıları  ' },
    });
    expect(created.statusCode).toBe(201);
    const list = created.json<ListResponse>().list;
    expect(list.title).toBe('Veri Yapıları');
    expect(Object.keys(list).sort()).toEqual([
      'createdAt',
      'id',
      'title',
      'updatedAt',
      'wordCount',
    ]);
    const separate = createDatabase(targets.runtime);
    try {
      const stored = await separate.wordList.findFirst({
        where: { id: list.id, ownerId: ownedUsers[0]! },
      });
      expect(stored?.title).toBe('Veri Yapıları');
    } finally {
      await separate.$disconnect();
    }
    expect((await a.inject(`/api/lists/${list.id}`)).json<ListResponse>().list.title).toBe(
      'Veri Yapıları',
    );
    const renamed = await a.inject({
      method: 'PATCH',
      url: `/api/lists/${list.id}`,
      payload: { title: 'Algorithms' },
    });
    expect(renamed.statusCode).toBe(200);
    expect(renamed.json<ListResponse>().list).toMatchObject({
      id: list.id,
      title: 'Algorithms',
      wordCount: 0,
    });
    expect(
      (await db.wordList.findFirst({ where: { id: list.id, ownerId: ownedUsers[0]! } }))?.title,
    ).toBe('Algorithms');
    expect((await a.inject({ method: 'DELETE', url: `/api/lists/${list.id}` })).statusCode).toBe(
      204,
    );
    expect(await db.wordList.count({ where: { id: list.id } })).toBe(0);
    expect(await db.user.count({ where: { id: ownedUsers[0]! } })).toBe(1);
  });

  it('normalizes NFC, permits duplicates, and orders the most recently updated first', async () => {
    const ids: string[] = [];
    for (let i = 0; i < 2; i++) {
      const response = await a.inject({
        method: 'POST',
        url: '/api/lists',
        payload: { title: '  I\u0307lk  ' },
      });
      expect(response.statusCode).toBe(201);
      expect(response.json<ListResponse>().list.title).toBe('İlk');
      ids.push(response.json<ListResponse>().list.id);
    }
    const renamed = await a.inject({
      method: 'PATCH',
      url: `/api/lists/${ids[0]!}`,
      payload: { title: 'Son düzenlenen' },
    });
    expect(renamed.statusCode).toBe(200);
    expect(renamed.json<ListResponse>().list.title).toBe('Son düzenlenen');
    const result = await a.inject('/api/lists');
    expect(result.statusCode).toBe(200);
    expect(result.json<ListsResponse>().lists[0]?.id).toBe(ids[0]);
  });

  it('returns real word counts when renaming without changing vocabulary', async () => {
    const created = await a.inject({
      method: 'POST',
      url: '/api/lists',
      payload: { title: 'Count fixture' },
    });
    expect(created.statusCode).toBe(201);
    const id = created.json<ListResponse>().list.id;
    for (const [english, meanings] of [
      ['run', ['koşmak', 'çalıştırmak']],
      ['apple', ['elma']],
    ] as const) {
      await db.word.create({
        data: {
          wordListId: id,
          english,
          normalizedEnglishKey: english,
          meanings: {
            create: meanings.map((turkish, position) => ({
              turkish,
              normalizedMeaningKey: turkish,
              position,
            })),
          },
        },
      });
    }
    const vocabulary = await db.word.findMany({
      where: { wordListId: id, wordList: { ownerId: ownedUsers[0]! } },
      include: { meanings: { orderBy: { position: 'asc' } } },
      orderBy: { id: 'asc' },
    });
    const renamed = await a.inject({
      method: 'PATCH',
      url: `/api/lists/${id}`,
      payload: { title: 'Renamed count fixture' },
    });
    expect(renamed.statusCode).toBe(200);
    expect(renamed.json<ListResponse>().list).toMatchObject({
      id,
      title: 'Renamed count fixture',
      wordCount: 2,
    });
    expect((await a.inject(`/api/lists/${id}`)).json<ListResponse>().list.wordCount).toBe(2);
    expect(
      await db.word.findMany({
        where: { wordListId: id, wordList: { ownerId: ownedUsers[0]! } },
        include: { meanings: { orderBy: { position: 'asc' } } },
        orderBy: { id: 'asc' },
      }),
    ).toEqual(vocabulary);
  });

  it('orders tied millisecond timestamps deterministically by descending UUID', async () => {
    const ids: string[] = [];
    for (let index = 0; index < 2; index++) {
      const created = await a.inject({
        method: 'POST',
        url: '/api/lists',
        payload: { title: 'Timestamp tie fixture' },
      });
      expect(created.statusCode).toBe(201);
      ids.push(created.json<ListResponse>().list.id);
    }
    const tiedAt = '2000-01-01T00:00:00.123Z';
    await db.wordList.updateMany({
      where: { id: { in: ids }, ownerId: ownedUsers[0]! },
      data: { updatedAt: new Date(tiedAt) },
    });
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await a.inject('/api/lists');
      expect(response.statusCode).toBe(200);
      const tied = response.json<ListsResponse>().lists.filter((list) => ids.includes(list.id));
      expect(tied.map((list) => list.updatedAt)).toEqual([tiedAt, tiedAt]);
      expect(tied.map((list) => list.id)).toEqual([...ids].sort().reverse());
    }
  });

  it('enforces ownership at the actual API boundary for A and B', async () => {
    const response = await b.inject({
      method: 'POST',
      url: '/api/lists',
      payload: { title: 'B private' },
    });
    const id = response.json<ListResponse>().list.id;
    expect((await b.inject(`/api/lists/${id}`)).statusCode).toBe(200);
    expect(
      (await a.inject('/api/lists')).json<ListsResponse>().lists.some((list) => list.id === id),
    ).toBe(false);
    for (const method of ['GET', 'PATCH', 'DELETE'] as const) {
      const options = {
        method,
        ...(method === 'PATCH' ? { payload: { title: 'Stolen' } } : {}),
        headers: { 'x-user-id': ownedUsers[1]!, cookie: `userId=${ownedUsers[1]!}` },
      };
      const forbidden = await a.inject({
        ...options,
        url: `/api/lists/${id}?userId=${ownedUsers[1]!}`,
      });
      const missing = await a.inject({ ...options, url: `/api/lists/${randomUUID()}` });
      expect(forbidden.statusCode).toBe(404);
      expect(forbidden.json()).toEqual({ error: { code: 'LIST_NOT_FOUND' } });
      expect(forbidden.statusCode).toBe(missing.statusCode);
      expect(forbidden.body).toBe(missing.body);
    }
    expect((await b.inject(`/api/lists/${id}`)).json<ListResponse>().list.title).toBe('B private');
    expect(
      (
        await b.inject({
          method: 'PATCH',
          url: `/api/lists/${id}`,
          payload: { title: 'B renamed' },
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await b.inject({
          method: 'POST',
          url: '/api/lists',
          payload: { title: 'Owner forgery', ownerId: ownedUsers[0] },
        })
      ).statusCode,
    ).toBe(400);
    expect((await b.inject({ method: 'DELETE', url: `/api/lists/${id}` })).statusCode).toBe(204);
  });

  it.each([
    [{ title: '' }, 'TITLE_REQUIRED'],
    [{ title: '   ' }, 'TITLE_REQUIRED'],
    [{ title: 'a'.repeat(101) }, 'TITLE_TOO_LONG'],
    [{ title: 1 }, 'VALIDATION_FAILED'],
    [{}, 'VALIDATION_FAILED'],
    [{ title: 'OK', userId: 'forged' }, 'VALIDATION_FAILED'],
  ])('returns standardized validation errors: %j', async (payload, code) => {
    const response = await a.inject({ method: 'POST', url: '/api/lists', payload });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: { code } });
  });

  it('rejects non-JSON mutation bodies and malformed UUIDs without leaking secrets', async () => {
    const response = await a.inject({
      method: 'POST',
      url: '/api/lists',
      headers: { 'content-type': 'text/plain' },
      payload: 'title=Algorithms',
    });
    expect(response.statusCode).toBe(415);
    expect(response.json()).toEqual({ error: { code: 'VALIDATION_FAILED' } });
    const deleteBody = await a.inject({
      method: 'DELETE',
      url: `/api/lists/${randomUUID()}`,
      headers: { 'content-type': 'text/plain' },
      payload: 'ownerId=forged',
    });
    expect(deleteBody.statusCode).toBe(415);
    expect(deleteBody.json()).toEqual({ error: { code: 'VALIDATION_FAILED' } });
    for (const method of ['GET', 'PATCH', 'DELETE'] as const) {
      const res = await a.inject({
        method,
        url: '/api/lists/not-a-uuid',
        ...(method === 'PATCH' ? { payload: { title: 'OK' } } : {}),
      });
      expect(res.statusCode).toBe(400);
      expect(res.json()).toEqual({ error: { code: 'VALIDATION_FAILED' } });
      for (const key of [
        'DATABASE_URL',
        'TEST_DATABASE_URL',
        'TEST_MIGRATION_DATABASE_URL',
      ] as const) {
        const password = new URL(process.env[key]!).password;
        if (password) expect(res.body.includes(password)).toBe(false);
      }
    }
    const malformed = await a.inject({
      method: 'POST',
      url: '/api/lists',
      headers: { 'content-type': 'application/json' },
      payload: '{',
    });
    expect(malformed.statusCode).toBe(400);
    expect(malformed.json()).toEqual({ error: { code: 'VALIDATION_FAILED' } });
  });

  it('provisions one stable identity under concurrent first requests without orphan Users', async () => {
    const before = await db.user.count();
    const ids = await Promise.all(Array.from({ length: 8 }, () => resolveUser(db, identity(2))));
    expect(new Set(ids).size).toBe(1);
    expect(await resolveUser(db, identity(2))).toBe(ids[0]);
    expect(await db.userIdentity.count({ where: identity(2) })).toBe(1);
    expect(await db.user.count()).toBe(before + 1);
  });

  it('cascades User deletion to identities/lists and preserves unrelated owners', async () => {
    const userId = await resolveUser(db, identity(3));
    const list = await db.wordList.create({ data: { ownerId: userId, title: 'Cascade fixture' } });
    await db.user.delete({ where: { id: userId } });
    expect(await db.userIdentity.count({ where: { userId } })).toBe(0);
    expect(await db.wordList.count({ where: { id: list.id } })).toBe(0);
    expect(await db.user.count({ where: { id: { in: ownedUsers } } })).toBe(2);
  });
});
