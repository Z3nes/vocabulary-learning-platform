import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { resolveUser } from '../src/auth/identity.js';
import { createDatabase } from '../src/db/client.js';
import type { PrismaClient } from '../src/generated/prisma/client.js';
import type { Submission } from '../src/vocabulary/input.js';
import type { processVocabulary, wordSelection } from '../src/vocabulary/service.js';
import type { Prisma } from '../src/generated/prisma/client.js';
import { loadLocalEnvironment, verifyTestDatabase } from './databaseSafety.js';
import { testConfig } from './helpers.js';

loadLocalEnvironment();
const targets = await verifyTestDatabase();
const db = createDatabase(targets.runtime);
const subjects = [`words-${randomUUID()}-A`, `words-${randomUUID()}-B`];
const identity = (index: number) => ({ provider: 'test', subject: subjects[index]! });
const users: string[] = [];
let a: FastifyInstance;
let b: FastifyInstance;
type Preview = Awaited<ReturnType<typeof processVocabulary>>;
type Word = Prisma.WordGetPayload<{ select: typeof wordSelection }>;
const single = (english: string, meanings = ['koşmak']): Submission => ({
  kind: 'single',
  entry: { english, meanings },
});
const bulk = (text: string): Submission => ({ kind: 'bulk', text });
const base = (id: string) => `/api/lists/${id}/words`;
const preview = (app: FastifyInstance, id: string, input: Submission) =>
  app.inject({ method: 'POST', url: `${base(id)}/preview`, payload: input });
const commit = (app: FastifyInstance, id: string, input: Submission, token: string) =>
  app.inject({ method: 'POST', url: `${base(id)}/commit`, payload: { submission: input, token } });
async function add(app: FastifyInstance, id: string, input: Submission) {
  const result = await preview(app, id, input);
  expect(result.statusCode).toBe(200);
  const saved = await commit(app, id, input, result.json<Preview>().token);
  expect(saved.statusCode).toBe(200);
  return saved.json<Preview & { changed: boolean }>();
}
async function list(app = a) {
  const response = await app.inject({
    method: 'POST',
    url: '/api/lists',
    payload: { title: 'Vocabulary fixture' },
  });
  expect(response.statusCode).toBe(201);
  return response.json<{ list: { id: string } }>().list.id;
}
async function words(id: string, app = a) {
  const response = await app.inject(base(id));
  expect(response.statusCode).toBe(200);
  return response.json<{ words: Word[] }>().words;
}
const timestamp = async (id: string) =>
  (
    await db.wordList.findFirstOrThrow({ where: { id, ownerId: users[0]! } })
  ).updatedAt.toISOString();

beforeAll(async () => {
  // Fail before fixture writes if the incremental migration has not been applied.
  await db.word.count();
  for (const index of [0, 1]) users.push(await resolveUser(db, identity(index)));
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
  const owned = await db.userIdentity.findMany({
    where: { provider: 'test', subject: { in: subjects } },
    select: { userId: true },
  });
  await db.user.deleteMany({ where: { id: { in: owned.map((row) => row.userId) } } });
  await db.$disconnect();
});

describe('owned vocabulary through the real API and PostgreSQL', () => {
  it.each(['single', 'bulk'] as const)(
    'requires an explicit possible-duplicate decision in %s mode before any writes',
    async (kind) => {
      const id = await list();
      await add(a, id, single('run', ['çalışmak']));
      const before = await words(id);
      const time = await timestamp(id);
      const input =
        kind === 'single' ? single('run', ['calismak']) : bulk('run=calismak\napple=elma');
      const pending = (await preview(a, id, input)).json<Preview>();
      expect(pending.unresolvedDecisions).toBe(1);
      expect(pending.canCommit).toBe(false);
      expect(pending.rows[0]?.meanings[0]?.similarity).toEqual({
        id: '1:1',
        existing: 'çalışmak',
        action: null,
      });
      const response = await commit(a, id, input, pending.token);
      expect(response.statusCode).toBe(409);
      expect(response.json()).toEqual({ error: { code: 'SIMILARITY_DECISION_REQUIRED' } });
      expect(await words(id)).toEqual(before);
      expect(await timestamp(id)).toBe(time);
    },
  );
  it.each(['skip', 'keep'] as const)(
    'revalidates and persists only the explicitly approved %s choice',
    async (action) => {
      const id = await list();
      await add(a, id, single('run', ['çalışmak']));
      const time = await timestamp(id);
      const input = { ...single('run', ['calismak']), decisions: [{ id: '1:1', action }] };
      const saved = await add(a, id, input);
      expect(saved.changed).toBe(action === 'keep');
      expect((await words(id))[0]?.meanings.map((meaning) => meaning.turkish)).toEqual(
        action === 'keep' ? ['çalışmak', 'calismak'] : ['çalışmak'],
      );
      expect(saved.counts.newMeanings).toBe(action === 'keep' ? 1 : 0);
      const repeated = await add(a, id, single('run', ['ÇALIŞMAK']));
      expect(repeated.unresolvedDecisions).toBe(0);
      expect(repeated.changed).toBe(false);
      expect(repeated.counts.skippedMeanings).toBe(1);
      if (action === 'skip') expect(await timestamp(id)).toBe(time);
      else expect(await timestamp(id)).not.toBe(time);
    },
  );
  it.each(['skip', 'keep'] as const)(
    'handles %s for similarities and exact repeated rows within one new batch',
    async (action) => {
      const id = await list();
      const input = {
        ...bulk('run=çalışmak\nRUN=calismak\nrun=Calismak'),
        decisions: [{ id: '2:1', action }],
      };
      const saved = await add(a, id, input);
      expect(saved.counts.newWords).toBe(1);
      expect(saved.counts.newMeanings).toBe(action === 'keep' ? 2 : 1);
      expect(await words(id)).toHaveLength(1);
      expect((await words(id))[0]?.meanings).toHaveLength(action === 'keep' ? 2 : 1);
    },
  );
  it('stores distinct gol/göl and ol/öl collisions only after keep choices', async () => {
    const id = await list();
    const input = {
      ...bulk('goal=gol;göl\nbe=ol;öl'),
      decisions: [
        { id: '1:2', action: 'keep' as const },
        { id: '2:2', action: 'keep' as const },
      ],
    };
    expect((await add(a, id, input)).counts).toMatchObject({ newWords: 2, newMeanings: 4 });
    expect(
      (await words(id)).flatMap((word) => word.meanings.map((meaning) => meaning.turkish)).sort(),
    ).toEqual(['gol', 'göl', 'ol', 'öl'].sort());
  });
  it('binds decisions to reviewed input and rejects changed choices or invalid source IDs', async () => {
    const id = await list();
    await add(a, id, single('run', ['öğrenmek']));
    const input = {
      ...single('run', ['ogrenmek']),
      decisions: [{ id: '1:1', action: 'keep' as const }],
    };
    const receipt = (await preview(a, id, input)).json<Preview>();
    const changed = { ...input, decisions: [{ id: '1:1', action: 'skip' as const }] };
    expect((await commit(a, id, changed, receipt.token)).json()).toEqual({
      error: { code: 'PREVIEW_STALE' },
    });
    expect(
      (await preview(a, id, { ...input, decisions: [{ id: '2:1', action: 'keep' }] })).json(),
    ).toEqual({ error: { code: 'SIMILARITY_DECISION_INVALID' } });
    expect(
      (
        await preview(a, id, { ...input, decisions: [...input.decisions, ...input.decisions] })
      ).json(),
    ).toEqual({ error: { code: 'SIMILARITY_DECISION_INVALID' } });
    expect((await words(id))[0]?.meanings.map((meaning) => meaning.turkish)).toEqual(['öğrenmek']);
  });
  it('rejects stale similarity decisions after a concurrent keep turns the proposal into an exact duplicate', async () => {
    const id = await list();
    await add(a, id, single('run', ['çalışmak']));
    const input = {
      ...single('run', ['calismak']),
      decisions: [{ id: '1:1', action: 'keep' as const }],
    };
    const receipt = (await preview(a, id, input)).json<Preview>();
    const responses = await Promise.all([
      commit(a, id, input, receipt.token),
      commit(a, id, input, receipt.token),
    ]);
    expect(responses.map((response) => response.statusCode).sort()).toEqual([200, 409]);
    expect(responses.find((response) => response.statusCode === 409)?.json()).toEqual({
      error: { code: 'PREVIEW_STALE' },
    });
    const refreshed = (await preview(a, id, single('run', ['calismak']))).json<Preview>();
    expect(refreshed.unresolvedDecisions).toBe(0);
    expect(refreshed.rows[0]?.meanings[0]?.status).toBe('existing');
    expect((await words(id))[0]?.meanings).toHaveLength(2);
  });
  it('keeps similarity choices owner scoped at the actual API boundary', async () => {
    const id = await list(b);
    await add(b, id, single('run', ['çalışmak']));
    const input = { ...bulk('run=calismak'), decisions: [{ id: '1:1', action: 'keep' as const }] };
    const receipt = (await preview(b, id, input)).json<Preview>();
    expect((await preview(a, id, input)).json()).toEqual({ error: { code: 'LIST_NOT_FOUND' } });
    expect((await commit(a, id, input, receipt.token)).json()).toEqual({
      error: { code: 'LIST_NOT_FOUND' },
    });
    expect((await words(id, b))[0]?.meanings).toHaveLength(1);
  });
  it('previews without writes then creates multiple ordered meanings, visible from another connection', async () => {
    const id = await list();
    const input = single('  Run  ', [' koşmak ', 'çalıştırmak']);
    const before = await timestamp(id);
    const result = await preview(a, id, input);
    expect(result.json<Preview>().counts).toMatchObject({ newWords: 1, newMeanings: 2 });
    expect(await words(id)).toEqual([]);
    expect(await timestamp(id)).toBe(before);
    expect((await commit(a, id, input, result.json<Preview>().token)).statusCode).toBe(200);
    const stored = await words(id);
    expect(stored).toHaveLength(1);
    expect(stored[0]?.english).toBe('Run');
    expect(stored[0]?.meanings.map((meaning) => [meaning.turkish, meaning.position])).toEqual([
      ['koşmak', 0],
      ['çalıştırmak', 1],
    ]);
    const separate = createDatabase(targets.runtime);
    try {
      expect(
        await separate.word.count({ where: { wordListId: id, wordList: { ownerId: users[0]! } } }),
      ).toBe(1);
    } finally {
      await separate.$disconnect();
    }
    expect(await timestamp(id)).not.toBe(before);
  });
  it('merges new and partially duplicate meanings into one Word', async () => {
    const id = await list();
    await add(a, id, single('run'));
    const input = single('RUN', ['koşmak', 'çalıştırmak']);
    const proposal = (await preview(a, id, input)).json<Preview>();
    expect(proposal.rows[0]).toMatchObject({
      status: 'merge',
      meanings: [
        { turkish: 'koşmak', status: 'existing' },
        { turkish: 'çalıştırmak', status: 'new' },
      ],
    });
    expect((await add(a, id, input)).counts).toMatchObject({
      newWords: 0,
      mergedWords: 1,
      newMeanings: 1,
      skippedMeanings: 1,
    });
    expect((await words(id))[0]?.meanings).toHaveLength(2);
    expect(await words(id)).toHaveLength(1);
  });
  it('exact duplicates leave every row and timestamp unchanged', async () => {
    const id = await list();
    await add(a, id, single('run'));
    const before = await words(id);
    const time = await timestamp(id);
    const result = await add(a, id, single('RUN'));
    expect(result.changed).toBe(false);
    expect(result.counts.newMeanings).toBe(0);
    expect(await words(id)).toEqual(before);
    expect(await timestamp(id)).toBe(time);
  });
  it('keeps vocabulary independent across lists and users', async () => {
    const first = await list();
    const second = await list();
    const foreign = await list(b);
    await add(a, first, single('run'));
    await add(a, second, single('run', ['çalıştırmak']));
    await add(b, foreign, single('run', ['işletmek']));
    expect((await words(first))[0]?.meanings[0]?.turkish).toBe('koşmak');
    expect((await words(second))[0]?.meanings[0]?.turkish).toBe('çalıştırmak');
    expect((await words(foreign, b))[0]?.meanings[0]?.turkish).toBe('işletmek');
  });
  it('atomically edits English and replaces all meanings in submitted order', async () => {
    const id = await list();
    await add(a, id, single('run', ['koşmak', 'çalıştırmak']));
    const word = (await words(id))[0]!;
    const time = await timestamp(id);
    const result = await a.inject({
      method: 'PATCH',
      url: `${base(id)}/${word.id}`,
      payload: { english: 'execute', meanings: ['yürütmek', 'çalıştırmak'] },
    });
    expect(result.statusCode).toBe(200);
    expect(result.json<{ changed: boolean }>().changed).toBe(true);
    const updated = (await words(id))[0]!;
    expect(updated.id).toBe(word.id);
    expect(updated.english).toBe('execute');
    expect(updated.meanings.map((meaning) => [meaning.turkish, meaning.position])).toEqual([
      ['yürütmek', 0],
      ['çalıştırmak', 1],
    ]);
    expect(
      await db.wordMeaning.count({
        where: { id: { in: word.meanings.map((meaning) => meaning.id) } },
      }),
    ).toBe(0);
    expect(await timestamp(id)).not.toBe(time);
  });
  it('no-op edits preserve meaning IDs and timestamps', async () => {
    const id = await list();
    await add(a, id, single('run'));
    const word = (await words(id))[0]!;
    const time = await timestamp(id);
    const response = await a.inject({
      method: 'PATCH',
      url: `${base(id)}/${word.id}`,
      payload: { english: '  run  ', meanings: [' koşmak '] },
    });
    expect(response.json<{ changed: boolean }>().changed).toBe(false);
    expect(await words(id)).toEqual([word]);
    expect(await timestamp(id)).toBe(time);
  });
  it('English-only edits preserve meanings and failed replacements restore the original rows', async () => {
    const id = await list();
    await add(a, id, single('run'));
    const original = (await words(id))[0]!;
    const url = `${base(id)}/${original.id}`;
    expect(
      (await a.inject({ method: 'PATCH', url, payload: { english: 'Run', meanings: ['koşmak'] } }))
        .statusCode,
    ).toBe(200);
    const before = await words(id);
    const time = await timestamp(id);
    expect(before[0]?.meanings).toEqual(original.meanings);
    const failing = db.$extends({
      query: {
        word: {
          async update({ args, query }) {
            await query(args);
            throw new Error('Injected replacement failure');
          },
        },
      },
    });
    const app = await buildApp({
      config: testConfig({ databaseUrl: targets.runtime }),
      db: failing as unknown as PrismaClient,
      logger: false,
      identityProvider: { resolve: () => Promise.resolve(identity(0)) },
    });
    try {
      const response = await app.inject({
        method: 'PATCH',
        url,
        payload: { english: 'execute', meanings: ['yürütmek', 'çalıştırmak'] },
      });
      expect(response.json()).toEqual({ error: { code: 'INTERNAL_ERROR' } });
    } finally {
      await app.close();
    }
    expect(await words(id)).toEqual(before);
    expect(await timestamp(id)).toBe(time);
  });
  it('rejects editing collisions without silently merging or touching timestamps', async () => {
    const id = await list();
    await add(a, id, bulk('run=koşmak\nexecute=yürütmek'));
    const before = await words(id);
    const time = await timestamp(id);
    const word = before.find((word) => word.english === 'run')!;
    const response = await a.inject({
      method: 'PATCH',
      url: `${base(id)}/${word.id}`,
      payload: { english: 'EXECUTE', meanings: ['yeni'] },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: { code: 'WORD_ALREADY_EXISTS' } });
    expect(await words(id)).toEqual(before);
    expect(await timestamp(id)).toBe(time);
  });
  it.each([
    [[], 'MEANING_REQUIRED'],
    [['  '], 'MEANING_REQUIRED'],
    [['İŞ', 'iş'], 'MEANING_ALREADY_EXISTS'],
    [['a'.repeat(161)], 'MEANING_TOO_LONG'],
  ])('rejects an invalid complete meaning replacement', async (meanings, code) => {
    const id = await list();
    await add(a, id, single('run'));
    const before = await words(id);
    const response = await a.inject({
      method: 'PATCH',
      url: `${base(id)}/${before[0]!.id}`,
      payload: { english: 'run', meanings },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: { code } });
    expect(await words(id)).toEqual(before);
  });
  it('deletes a word and its meanings while preserving its list, user and other words', async () => {
    const id = await list();
    await add(a, id, bulk('run=koşmak;çalıştırmak\napple=elma'));
    const word = (await words(id)).find((word) => word.english === 'run')!;
    const time = await timestamp(id);
    expect((await a.inject({ method: 'DELETE', url: `${base(id)}/${word.id}` })).statusCode).toBe(
      204,
    );
    expect(await db.wordMeaning.count({ where: { wordId: word.id } })).toBe(0);
    expect(await words(id)).toHaveLength(1);
    expect(await timestamp(id)).not.toBe(time);
    expect(await db.user.count({ where: { id: users[0]! } })).toBe(1);
  });
  it('cascades list deletion to words and meanings and preserves unrelated owners', async () => {
    const id = await list();
    const other = await list(b);
    await add(a, id, single('run'));
    await add(b, other, single('run'));
    const word = (await words(id))[0]!;
    await a.inject({ method: 'DELETE', url: `/api/lists/${id}` });
    expect(await db.word.count({ where: { wordListId: id } })).toBe(0);
    expect(await db.wordMeaning.count({ where: { wordId: word.id } })).toBe(0);
    expect(await words(other, b)).toHaveLength(1);
  });
  it('handles concurrent same-plan commits with uniqueness and stale protection', async () => {
    const id = await list();
    const input = single('run');
    const receipt = (await preview(a, id, input)).json<Preview>();
    const responses = await Promise.all([
      commit(a, id, input, receipt.token),
      commit(a, id, input, receipt.token),
    ]);
    expect(responses.map((result) => result.statusCode).sort()).toEqual([200, 409]);
    expect(responses.find((result) => result.statusCode === 409)?.json()).toEqual({
      error: { code: 'PREVIEW_STALE' },
    });
    expect(await words(id)).toHaveLength(1);
    expect((await words(id))[0]?.meanings).toHaveLength(1);
  });
  it('requires a fresh preview when another request adds a meaning or edits the relevant word', async () => {
    const id = await list();
    await add(a, id, single('run'));
    const input = single('run', ['yürütmek']);
    const receipt = (await preview(a, id, input)).json<Preview>();
    await add(a, id, single('run', ['çalıştırmak']));
    const response = await commit(a, id, input, receipt.token);
    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: { code: 'PREVIEW_STALE' } });
    expect((await words(id))[0]?.meanings.map((meaning) => meaning.turkish)).toEqual([
      'koşmak',
      'çalıştırmak',
    ]);
    expect((await add(a, id, input)).changed).toBe(true);
  });
  it('rejects previews after relevant English edits or deletion', async () => {
    const id = await list();
    await add(a, id, single('run'));
    const input = single('run', ['yeni']);
    const first = (await preview(a, id, input)).json<Preview>();
    const word = (await words(id))[0]!;
    expect(
      (
        await a.inject({
          method: 'PATCH',
          url: `${base(id)}/${word.id}`,
          payload: { english: 'Run', meanings: ['koşmak'] },
        })
      ).statusCode,
    ).toBe(200);
    expect((await commit(a, id, input, first.token)).json()).toEqual({
      error: { code: 'PREVIEW_STALE' },
    });
    const second = (await preview(a, id, input)).json<Preview>();
    await a.inject({ method: 'DELETE', url: `${base(id)}/${word.id}` });
    expect((await commit(a, id, input, second.token)).json()).toEqual({
      error: { code: 'PREVIEW_STALE' },
    });
  });
  it('allows unrelated vocabulary changes while keeping approved operations identical', async () => {
    const id = await list();
    const input = single('run');
    const receipt = (await preview(a, id, input)).json<Preview>();
    await add(a, id, single('apple', ['elma']));
    expect((await commit(a, id, input, receipt.token)).statusCode).toBe(200);
  });
  it('binds approval to exact input, owner and list; rejects forged classifications', async () => {
    const id = await list();
    const other = await list();
    const input = single('run');
    const receipt = (await preview(a, id, input)).json<Preview>();
    expect((await commit(a, id, single('run', ['başka']), receipt.token)).statusCode).toBe(409);
    expect((await commit(a, other, input, receipt.token)).statusCode).toBe(409);
    expect((await commit(a, id, input, '0'.repeat(64))).statusCode).toBe(409);
    expect(
      (
        await a.inject({
          method: 'POST',
          url: `${base(id)}/commit`,
          payload: { submission: input, token: receipt.token, counts: { newWords: 100 } },
        })
      ).statusCode,
    ).toBe(400);
    expect(await words(id)).toEqual([]);
  });
  it('bulk-imports mixed new, merged, duplicate and repeated rows including TAB and comma hints', async () => {
    const id = await list();
    await add(a, id, single('run'));
    const input = bulk(
      'run=koşmak\nRUN\tçalıştırmak\napple=elma\nApple=elma;meyve\nwell-being=sağlık, esenlik',
    );
    const receipt = (await preview(a, id, input)).json<Preview>();
    expect(receipt.counts).toEqual({
      newWords: 2,
      mergedWords: 1,
      newMeanings: 4,
      skippedMeanings: 2,
      duplicateEntries: 1,
    });
    expect(receipt.rows[4]?.warnings).toContain('COMMA_HINT');
    expect((await add(a, id, input)).counts).toEqual(receipt.counts);
    expect(await words(id)).toHaveLength(3);
  });
  it('malformed bulk lines block the entire commit without partial data or timestamp changes', async () => {
    const id = await list();
    const time = await timestamp(id);
    const input = bulk('apple=elma\n=eksik\na\tb\tc');
    const receipt = (await preview(a, id, input)).json<Preview>();
    expect(receipt.invalid.map((row) => row.line)).toEqual([2, 3]);
    expect(receipt.canCommit).toBe(false);
    expect((await commit(a, id, input, receipt.token)).statusCode).toBe(400);
    expect(await words(id)).toEqual([]);
    expect(await timestamp(id)).toBe(time);
  });
  it('rolls back a real PostgreSQL transaction when a failure occurs after writes', async () => {
    const id = await list();
    const time = await timestamp(id);
    const input = bulk('apple=elma\nfail=başarısız');
    const receipt = (await preview(a, id, input)).json<Preview>();
    // Failure injection after an actual INSERT exercises rollback, not a mock database.
    const failing = db.$extends({
      query: {
        wordMeaning: {
          async createMany({ args, query }) {
            const result = await query(args);
            if (result.count > 0) throw new Error('Injected transaction failure');
            return result;
          },
        },
      },
    });
    const app = await buildApp({
      config: testConfig({ databaseUrl: targets.runtime }),
      db: failing as unknown as PrismaClient,
      logger: false,
      identityProvider: { resolve: () => Promise.resolve(identity(0)) },
    });
    try {
      const response = await commit(app, id, input, receipt.token);
      expect(response.statusCode).toBe(500);
      expect(response.json()).toEqual({ error: { code: 'INTERNAL_ERROR' } });
    } finally {
      await app.close();
    }
    expect(await words(id)).toEqual([]);
    expect(await timestamp(id)).toBe(time);
  });
  it('returns accurate owner-scoped Word counts, updated ordering, and excludes meaning counts', async () => {
    const id = await list();
    const other = await list();
    await add(a, id, single('run', ['koşmak', 'çalıştırmak']));
    const result = (await a.inject('/api/lists')).json<{
      lists: { id: string; wordCount: number }[];
    }>();
    expect(result.lists[0]?.id).toBe(id);
    expect(result.lists.find((row) => row.id === id)?.wordCount).toBe(1);
    expect(result.lists.find((row) => row.id === other)?.wordCount).toBe(0);
    const word = (await words(id))[0]!;
    await a.inject({ method: 'DELETE', url: `${base(id)}/${word.id}` });
    expect(
      (await a.inject(`/api/lists/${id}`)).json<{ list: { wordCount: number } }>().list.wordCount,
    ).toBe(0);
  });
  it.each([
    ['a=b\n'.repeat(500), 'BULK_TOO_MANY_LINES', 400],
    ['ş'.repeat(51_201), 'BULK_TOO_LARGE', 413],
  ])('enforces server bulk limits through the API', async (text, code, status) => {
    const id = await list();
    const response = await preview(a, id, bulk(text));
    expect(response.statusCode).toBe(status);
    expect(response.json()).toEqual({ error: { code } });
    expect(await words(id)).toEqual([]);
  });
  it('allows a valid 500-line batch without imposing an arbitrary saved-word limit', async () => {
    const id = await list();
    const input = bulk(
      Array.from({ length: 500 }, (_, index) => `term ${index}=anlam ${index}`).join('\n'),
    );
    expect((await add(a, id, input)).counts.newWords).toBe(500);
    expect(await words(id)).toHaveLength(500);
  }, 30_000);
  it('maps transport overflow and commit-time UTF-8 limits to stable errors', async () => {
    const id = await list();
    expect((await preview(a, id, bulk('a'.repeat(4 * 1024 * 1024 + 1)))).json()).toEqual({
      error: { code: 'BULK_TOO_LARGE' },
    });
    expect((await commit(a, id, bulk('ş'.repeat(51_201)), '0'.repeat(64))).json()).toEqual({
      error: { code: 'BULK_TOO_LARGE' },
    });
    // JSON escaping expands this raw 100 KB text; the application-level parser must still run.
    const escaped = await a.inject({
      method: 'POST',
      url: `${base(id)}/preview`,
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify(bulk('\u0001'.repeat(100 * 1024))),
    });
    expect(escaped.statusCode).toBe(200);
    expect(escaped.json<Preview>().invalid[0]?.codes).toEqual(['BULK_INVALID_CONTENT']);
    expect(await words(id)).toEqual([]);
  });
  it('protects read, single add/merge, edit, delete, bulk preview/commit and guessed meanings through A/B API boundaries', async () => {
    const id = await list(b);
    const input = single('run');
    await add(b, id, input);
    const word = (await words(id, b))[0]!;
    const time = (await db.wordList.findUniqueOrThrow({ where: { id } })).updatedAt;
    const receipt = (await preview(b, id, single('run', ['yeni']))).json<Preview>();
    for (const route of [
      { method: 'GET' as const, suffix: '' },
      { method: 'GET' as const, suffix: `/${word.id}` },
      { method: 'POST' as const, suffix: '/preview', payload: input },
      { method: 'POST' as const, suffix: '/preview', payload: bulk('apple=elma') },
      {
        method: 'POST' as const,
        suffix: '/commit',
        payload: { submission: single('run', ['yeni']), token: receipt.token },
      },
      {
        method: 'POST' as const,
        suffix: '/commit',
        payload: { submission: bulk('apple=elma'), token: receipt.token },
      },
      {
        method: 'PATCH' as const,
        suffix: `/${word.id}`,
        payload: { english: 'stolen', meanings: ['yeni'] },
      },
      { method: 'DELETE' as const, suffix: `/${word.id}` },
    ]) {
      const response = await a.inject({
        method: route.method,
        url: `${base(id)}${route.suffix}?ownerId=${users[1]!}`,
        headers: { 'x-user-id': users[1]! },
        ...('payload' in route ? { payload: route.payload } : {}),
      });
      const missing = await a.inject({
        method: route.method,
        url: `${base(randomUUID())}${route.suffix}`,
        ...('payload' in route ? { payload: route.payload } : {}),
      });
      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ error: { code: 'LIST_NOT_FOUND' } });
      expect(response.body).toBe(missing.body);
    }
    const own = await list();
    for (const guessedId of [word.id, word.meanings[0]!.id])
      expect((await a.inject(`${base(own)}/${guessedId}`)).json()).toEqual({
        error: { code: 'WORD_NOT_FOUND' },
      });
    expect(
      (await a.inject(`${base(id)}/${word.id}/meanings/${word.meanings[0]!.id}`)).statusCode,
    ).toBe(404);
    expect(await words(id, b)).toEqual([word]);
    expect((await db.wordList.findUniqueOrThrow({ where: { id } })).updatedAt).toEqual(time);
  });
  it('requires JSON, validates UUIDs and refuses client-provided ownership', async () => {
    const id = await list();
    const response = await a.inject({
      method: 'POST',
      url: `${base(id)}/preview`,
      headers: { 'content-type': 'text/plain' },
      payload: 'run=koşmak',
    });
    expect(response.statusCode).toBe(415);
    expect((await a.inject(`${base('invalid')}`)).statusCode).toBe(400);
    expect(
      (
        await a.inject({
          method: 'POST',
          url: `${base(id)}/preview`,
          payload: { ...single('run'), ownerId: users[1] },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await a.inject({
          method: 'POST',
          url: `${base(id)}/preview`,
          payload: {
            kind: 'single',
            entry: { english: 'run', meanings: ['koşmak'], ownerId: users[1] },
          },
        })
      ).json<Preview>().invalid,
    ).toHaveLength(1);
  });
});
