import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { createDatabase } from '../src/db/client.js';
import { resolveUser } from '../src/auth/identity.js';
import { cells, type PuzzleType } from '../src/puzzles/engine.js';
import { documentOf, getPuzzle, type PuzzleMove } from '../src/puzzles/service.js';
import { englishKey, meaningKey } from '../src/vocabulary/input.js';
import { loadLocalEnvironment, verifyTestDatabase } from './databaseSafety.js';
import { testConfig } from './helpers.js';
import type { Prisma } from '../src/generated/prisma/client.js';

loadLocalEnvironment();
const targets = await verifyTestDatabase();
const db = createDatabase(targets.runtime);
const identities = [0, 1].map(() => ({ provider: 'test', subject: `puzzles-${randomUUID()}` }));
const users: string[] = [],
  apps: FastifyInstance[] = [];
let a: FastifyInstance, device: FastifyInstance, b: FastifyInstance;
type Session = Awaited<ReturnType<typeof getPuzzle>>;
interface Reply {
  session: Session;
  applied: boolean;
  correct: boolean | null;
}
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
beforeAll(async () => {
  await db.puzzleSession.count();
  for (const identity of identities) users.push(await resolveUser(db, identity));
  for (const identity of [identities[0]!, identities[0]!, identities[1]!])
    apps.push(
      await buildApp({
        config: testConfig({ databaseUrl: targets.runtime }),
        db,
        logger: false,
        identityProvider: { resolve: () => Promise.resolve(identity) },
      }),
    );
  [a, device, b] = apps as [FastifyInstance, FastifyInstance, FastifyInstance];
});
afterAll(async () => {
  await Promise.all(apps.map((app) => app.close()));
  await db.user.deleteMany({ where: { id: { in: users } } });
  await db.$disconnect();
});
async function fixture(entries = terms) {
  const list = await db.wordList.create({ data: { ownerId: users[0]!, title: 'Puzzle fixture' } });
  const words = [];
  for (const [index, english] of entries.entries()) {
    const meanings = ['anlam ' + index, 'diğer karşılık ' + index];
    words.push(
      await db.word.create({
        data: {
          wordListId: list.id,
          english,
          normalizedEnglishKey: englishKey(english),
          meanings: {
            create: meanings.map((turkish, position) => ({
              turkish,
              normalizedMeaningKey: meaningKey(turkish),
              position,
            })),
          },
        },
      }),
    );
  }
  return { list, words };
}
const startRequest = (listId: string, gameType: PuzzleType, percentage = 100, app = a) =>
  app.inject({
    method: 'POST',
    url: `/api/lists/${listId}/puzzles`,
    payload: { gameType, percentage },
  });
async function start(listId: string, type: PuzzleType, percentage = 100) {
  const r = await startRequest(listId, type, percentage);
  expect(r.statusCode, r.body).toBe(201);
  return r.json<Reply>().session;
}
const call = (s: Session, action: string, payload: object = {}, app = a) =>
  app.inject({ method: 'POST', url: `/api/puzzles/${s.id}/${action}`, payload });
async function move(
  s: Session,
  payload: Omit<PuzzleMove, 'version' | 'commandId'> | object,
  app = a,
) {
  const r = await call(
    s,
    'moves',
    { version: s.version, commandId: randomUUID(), ...payload },
    app,
  );
  expect(r.statusCode, r.body).toBe(200);
  return r.json<Reply>();
}
async function solve(s: Session) {
  const stored = await db.puzzleSession.findUniqueOrThrow({ where: { id: s.id } });
  const d = documentOf(stored);
  for (let board = 0; board < d.boards.length; board++) {
    const layout = d.boards[board]!;
    if (s.gameType === 'crossword')
      s = (await move(s, { action: 'draft', board, values: layout.grid })).session;
    for (const e of layout.entries) {
      if (e.solved) continue;
      if (s.gameType === 'word-search') {
        const path = cells(e);
        const first = path[0]!,
          last = path.at(-1)!;
        s = (
          await move(s, {
            action: 'select',
            board,
            start: first.row * layout.cols + first.col,
            end: last.row * layout.cols + last.col,
          })
        ).session;
      } else s = (await move(s, { action: 'check', board, entryId: e.id })).session;
    }
  }
  return s;
}
for (const type of ['word-search', 'crossword'] as const)
  describe(`${type} authoritative PostgreSQL lifecycle`, () => {
    it('isolates every owned list, session, command and history from other identities', async () => {
      const f = await fixture(),
        s = await start(f.list.id, type);
      expect((await startRequest(f.list.id, type, 100, b)).statusCode).toBe(404);
      expect((await b.inject(`/api/lists/${f.list.id}/puzzles?gameType=${type}`)).statusCode).toBe(
        404,
      );
      expect((await b.inject(`/api/puzzles/${s.id}`)).statusCode).toBe(404);
      expect(
        (await b.inject(`/api/puzzles/active?gameType=${type}`)).json<{ sessions: unknown[] }>()
          .sessions,
      ).toEqual([]);
      for (const action of ['complete', 'cancel'])
        expect((await call(s, action, {}, b)).statusCode).toBe(404);
      expect(
        (
          await call(
            s,
            'moves',
            { action: 'select', board: 0, start: 0, end: 0, version: 0, commandId: randomUUID() },
            b,
          )
        ).statusCode,
      ).toBe(404);
      expect(
        (await b.inject('/api/activity')).json<{ activities: unknown[] }>().activities,
      ).toEqual([]);
      expect((await a.inject(`/api/puzzles/${randomUUID()}`)).statusCode).toBe(404);
    });
    it('serializes starts and enforces partial uniqueness independently per list/type', async () => {
      const f = await fixture(),
        g = await fixture();
      const responses = await Promise.all([
        startRequest(f.list.id, type),
        startRequest(f.list.id, type, 100, device),
      ]);
      expect(responses.map((r) => r.statusCode).sort()).toEqual([201, 409]);
      const row = await db.puzzleSession.findFirstOrThrow({
        where: { wordListId: f.list.id, gameType: type },
      });
      const { id: _id, ...data } = row;
      await expect(
        db.puzzleSession.create({
          data: { ...data, document: data.document as Prisma.InputJsonValue },
        }),
      ).rejects.toMatchObject({ code: 'P2002' });
      await start(f.list.id, type === 'crossword' ? 'word-search' : 'crossword');
      await start(g.list.id, type);
      expect(
        (await device.inject(`/api/lists/${f.list.id}/puzzles?gameType=${type}`)).json<Reply>()
          .session.id,
      ).toBe(row.id);
    });
    it('freezes vocabulary, clues and layout across edits, deletions, renamed/deleted lists and devices', async () => {
      const f = await fixture(),
        s = await start(f.list.id, type);
      await db.word.update({ where: { id: f.words[0]!.id }, data: { english: 'edited' } });
      await db.wordMeaning.deleteMany({ where: { wordId: f.words[0]!.id } });
      await db.word.delete({ where: { id: f.words[1]!.id } });
      expect((await device.inject(`/api/puzzles/${s.id}`)).json<Reply>().session).toEqual(s);
      await db.wordList.update({ where: { id: f.list.id }, data: { title: 'Renamed' } });
      await db.wordList.delete({ where: { id: f.list.id } });
      const resumed = (await device.inject(`/api/puzzles/${s.id}`)).json<Reply>().session;
      expect(
        (await device.inject(`/api/puzzles/active?gameType=${type}`))
          .json<{ sessions: { id: string }[] }>()
          .sessions.some((a) => a.id === s.id),
      ).toBe(true);
      expect(resumed.listId).toBeNull();
      expect(resumed.listTitle).toBe('Puzzle fixture');
      const done = await solve(resumed);
      expect((await call(done, 'complete')).statusCode).toBe(200);
      const game = await db.completedGame.findFirstOrThrow({ where: { completionId: s.id } });
      expect(game.listTitle).toBe('Puzzle fixture');
      expect(JSON.stringify(game.items)).not.toContain('edited');
      expect(JSON.stringify(game.items)).toContain(f.list.id);
    });
    it('exposes no unsolved target spelling or stored solutions through the view', async () => {
      const f = await fixture(),
        s = await start(f.list.id, type);
      for (const board of s.boards)
        for (const e of board.entries) {
          expect(e).not.toHaveProperty('english');
          expect(e).not.toHaveProperty('letters');
          if (type === 'word-search') {
            expect(e).not.toHaveProperty('row');
            expect(e).not.toHaveProperty('dc');
          }
        }
      if (type === 'crossword')
        expect(s.boards.every((board) => board.grid.every((c) => c === null || c === ''))).toBe(
          true,
        );
      for (const term of terms) expect(JSON.stringify(s)).not.toContain(term);
      expect(s.unplaced).toEqual([]);
    });
    it('rejects stale commands, forged fields, invalid boards and premature completion', async () => {
      const f = await fixture(),
        s = await start(f.list.id, type);
      expect((await call(s, 'complete')).statusCode).toBe(409);
      for (const percentage of [-1, 0, 14, 26, 101])
        expect((await startRequest(f.list.id, type, percentage)).statusCode).toBe(400);
      const payload =
        type === 'word-search'
          ? { action: 'select', start: 0, end: 0 }
          : { action: 'draft', values: s.boards[0]!.draft };
      for (const extra of [{ version: 999 }, { board: 999 }])
        expect(
          (
            await call(s, 'moves', {
              commandId: randomUUID(),
              version: s.version,
              board: 0,
              ...payload,
              ...extra,
            })
          ).statusCode,
        ).toBe(409);
      for (const extra of [{ correct: true }, { solvedIds: [] }, { completion: true }])
        expect(
          (
            await call(s, 'moves', {
              commandId: randomUUID(),
              version: s.version,
              board: 0,
              ...payload,
              ...extra,
            })
          ).statusCode,
        ).toBe(400);
      expect((await call(s, 'complete', { score: 100 })).statusCode).toBe(400);
      expect(
        (
          await a.inject({
            method: 'POST',
            url: '/api/games/completions',
            payload: {
              completionId: randomUUID(),
              listId: f.list.id,
              gameType: type,
              status: 'completed',
              items: [],
            },
          })
        ).statusCode,
      ).toBe(400);
    });
    it('cancels idempotently with no incomplete/completed history and permits another active session', async () => {
      const f = await fixture(),
        s = await start(f.list.id, type);
      expect(await db.completedGame.count({ where: { completionId: s.id } })).toBe(0);
      const result = await call(s, 'cancel');
      expect(result.statusCode).toBe(200);
      expect((await call(s, 'cancel', {}, device)).json<Reply>().applied).toBe(false);
      expect((await call(s, 'complete')).statusCode).toBe(409);
      expect(await db.completedGame.count({ where: { completionId: s.id } })).toBe(0);
      await start(f.list.id, type);
    });
    it('completes all boards once under duplicate requests and retains immutable ordered history', async () => {
      const f = await fixture(),
        s = await solve(await start(f.list.id, type));
      const results = await Promise.all([call(s, 'complete'), call(s, 'complete', {}, device)]);
      expect(results.map((r) => r.json<Reply>().applied).sort()).toEqual([false, true]);
      expect(await db.completedGame.count({ where: { completionId: s.id } })).toBe(1);
      const game = await db.completedGame.findFirstOrThrow({ where: { completionId: s.id } });
      expect(game.wordListId).toBeNull();
      expect(game.gameType).toBe(type);
      const before = structuredClone(game.items);
      await db.word.deleteMany({ where: { wordListId: f.list.id } });
      expect((await db.completedGame.findUniqueOrThrow({ where: { id: game.id } })).items).toEqual(
        before,
      );
      const activities = (await device.inject('/api/activity')).json<{
        activities: { at: string; key: string; game?: { id: string } }[];
      }>().activities;
      expect(activities.some((a) => a.game?.id === game.id)).toBe(true);
      expect(activities.map((a) => a.at)).toEqual(
        activities
          .map((a) => a.at)
          .sort()
          .reverse(),
      );
      expect(
        (
          await call(s, 'moves', {
            action: 'select',
            commandId: randomUUID(),
            version: s.version,
            board: 0,
            start: 0,
            end: 0,
          })
        ).statusCode,
      ).toBe(409);
    });
    it('never creates or changes mastery or review state, including after successful completion', async () => {
      const f = await fixture();
      await db.wordProgress.create({
        data: { wordId: f.words[0]!.id, needsReview: true, knownStreak: 1 },
      });
      const before = await db.wordProgress.findMany({ where: { word: { wordListId: f.list.id } } });
      const s = await solve(await start(f.list.id, type));
      await call(s, 'complete');
      expect(
        await db.wordProgress.findMany({ where: { word: { wordListId: f.list.id } } }),
      ).toEqual(before);
    });
    it('serializes cancel/complete races into exactly one terminal outcome', async () => {
      const f = await fixture(),
        s = await solve(await start(f.list.id, type));
      const results = await Promise.all([call(s, 'complete'), call(s, 'cancel', {}, device)]);
      expect(results.map((r) => r.statusCode).sort()).toEqual([200, 409]);
      const stored = await db.puzzleSession.findUniqueOrThrow({ where: { id: s.id } });
      expect(await db.completedGame.count({ where: { completionId: s.id } })).toBe(
        stored.status === 'COMPLETED' ? 1 : 0,
      );
    });
    it('rolls back completion and version when history insertion fails', async () => {
      const f = await fixture(),
        s = await solve(await start(f.list.id, type));
      const injected = await db.completedGame.create({
        data: {
          ownerId: users[0]!,
          completionId: s.id,
          wordListId: null,
          listTitle: 'Rollback fixture',
          gameType: 'quiz',
          requestHash: 'test',
          items: [{}],
        },
      });
      expect((await call(s, 'complete')).statusCode).toBe(500);
      expect((await a.inject(`/api/puzzles/${s.id}`)).json<Reply>().session).toEqual(s);
      await db.completedGame.delete({ where: { id: injected.id } });
      expect((await call(s, 'complete')).statusCode).toBe(200);
    });
    it('enforces SQL counts, lifecycle, document, game-type and legacy history bounds', async () => {
      const f = await fixture(),
        s = await start(f.list.id, type);
      for (const data of [
        { percentage: 16 },
        { version: -1 },
        { placedCount: 0 },
        { selectedCount: 0 },
        { status: 'COMPLETED' as const },
        { document: {} },
        { gameType: 'made-up' },
        { scopeKey: 'ALL' },
      ])
        await expect(db.puzzleSession.update({ where: { id: s.id }, data })).rejects.toBeDefined();
      await expect(
        db.completedGame.create({
          data: {
            ownerId: users[0]!,
            completionId: randomUUID(),
            listTitle: 'Invalid fixture',
            gameType: 'memory',
            requestHash: 'test',
            items: Array.from({ length: 11 }, () => ({})),
          },
        }),
      ).rejects.toBeDefined();
      expect((await getPuzzle(db, users[0]!, s.id)).version).toBe(0);
    });
  });
describe('word-search endpoint validation and stable multi-board selection', () => {
  it('validates actual stored endpoints and supports reverse selection, retries and concurrency', async () => {
    const f = await fixture(['machine learning']),
      s = await start(f.list.id, 'word-search');
    expect((await move(s, { action: 'select', board: 0, start: 0, end: 1 })).correct).toBe(false);
    let current = await getPuzzle(db, users[0]!, s.id);
    const stored = await db.puzzleSession.findUniqueOrThrow({ where: { id: s.id } }),
      board = documentOf(stored).boards[0]!,
      e = board.entries[0]!,
      path = cells(e);
    const payload = {
      action: 'select',
      board: 0,
      version: current.version,
      commandId: randomUUID(),
      start: path.at(-1)!.row * board.cols + path.at(-1)!.col,
      end: path[0]!.row * board.cols + path[0]!.col,
    };
    const results = await Promise.all([
      call(current, 'moves', payload),
      call(current, 'moves', payload, device),
    ]);
    expect(results.map((r) => r.json<Reply>().applied).sort()).toEqual([false, true]);
    current = results[0].json<Reply>().session;
    expect(current.boards[0]!.entries[0]).toMatchObject({
      solved: true,
      english: 'machine learning',
    });
    expect((await call(current, 'moves', { ...payload, end: payload.end + 1 })).statusCode).toBe(
      409,
    );
    expect((await call(current, 'complete')).statusCode).toBe(200);
  });
  it.each([15, 25, 50, 100])(
    'uses eligible-pool rounding at %i, retains every selected identity across many boards',
    async (p) => {
      const valid = Array.from(
        { length: 81 },
        (_, i) =>
          `term${String.fromCharCode(65 + Math.floor(i / 26))}${String.fromCharCode(65 + (i % 26))}`,
      );
      const f = await fixture([...valid, 'C++', 'ice cream', 'icecream']);
      const s = await start(f.list.id, 'word-search', p);
      expect(s.eligibleCount).toBe(81);
      expect(s.selectedCount).toBe(Math.ceil((81 * p) / 100));
      expect(s.placedCount).toBe(s.selectedCount);
      expect(s.omitted).toHaveLength(3);
      expect(s.boards.length).toBe(Math.ceil(s.selectedCount / 8));
      expect((await device.inject(`/api/puzzles/${s.id}`)).json<Reply>().session).toEqual(s);
    },
  );
});
describe('crossword drafts, feedback and honest fallback', () => {
  it('persists a large selection as stable connected boards with explicit accounting', async () => {
    const terms = Array.from(
      { length: 120 },
      (_, i) =>
        `term${String.fromCharCode(65 + Math.floor(i / 26))}${String.fromCharCode(65 + (i % 26))}`,
    );
    const f = await fixture(terms),
      s = await start(f.list.id, 'crossword');
    expect(s.selectedCount).toBe(120);
    expect(s.boards.length).toBeGreaterThan(1);
    expect(s.placedCount + s.omitted.filter((w) => w.reason === 'layout').length).toBe(120);
    expect((await device.inject(`/api/puzzles/${s.id}`)).json<Reply>().session).toEqual(s);
    const stored = documentOf(await db.puzzleSession.findUniqueOrThrow({ where: { id: s.id } }));
    expect(stored.selected).toHaveLength(120);
    expect(new Set(stored.boards.flatMap((b) => b.entries.map((e) => e.id))).size).toBe(
      s.placedCount,
    );
  }, 20000);
  it('persists normalized cell input across devices, permits correction and does not leak wrong answers', async () => {
    const f = await fixture();
    let s = await start(f.list.id, 'crossword');
    const row = await db.puzzleSession.findUniqueOrThrow({ where: { id: s.id } }),
      board = documentOf(row).boards[0]!,
      e = board.entries[0]!;
    const incorrect = board.grid.map((v) => (v ? 'x' : ''));
    s = (await move(s, { action: 'draft', board: 0, values: incorrect })).session;
    const payload = {
      action: 'check',
      board: 0,
      entryId: e.id,
      version: s.version,
      commandId: randomUUID(),
    };
    const result = await call(s, 'moves', payload);
    expect(result.json<Reply>().correct).toBe(false);
    s = result.json<Reply>().session;
    expect(s.boards[0]!.entries.find((a) => a.id === e.id)).toMatchObject({
      solved: false,
      attempts: 1,
    });
    expect(s.boards[0]!.entries.find((a) => a.id === e.id)).not.toHaveProperty('english');
    expect((await call(s, 'moves', payload, device)).json<Reply>().applied).toBe(false);
    expect((await device.inject(`/api/puzzles/${s.id}`)).json<Reply>().session).toEqual(s);
    s = (
      await move(
        s,
        { action: 'draft', board: 0, values: board.grid.map((v) => v.toLowerCase()) },
        device,
      )
    ).session;
    const checked = await move(s, { action: 'check', board: 0, entryId: e.id });
    expect(checked.correct).toBe(true);
    expect(checked.session.boards[0]!.entries.find((a) => a.id === e.id)).toMatchObject({
      solved: true,
      attempts: 2,
      english: e.english,
    });
    s = (await move(checked.session, { action: 'draft', board: 0, values: incorrect })).session;
    for (const c of cells(e)) expect(s.boards[0]!.draft[c.row * board.cols + c.col]).toBe(c.letter);
    const blocked = board.grid.findIndex((v) => !v);
    if (blocked >= 0) {
      const values = [...s.boards[0]!.draft];
      values[blocked] = 'X';
      expect(
        (
          await call(s, 'moves', {
            action: 'draft',
            board: 0,
            values,
            version: s.version,
            commandId: randomUUID(),
          })
        ).statusCode,
      ).toBe(400);
    }
  });
  it.each(
    [[], ['C++'], ['cat'], ['cat', 'art'], ['aaa', 'bbb', 'ccc']].map((terms) => ({ terms })),
  )('returns an honest fallback for $terms without creating a session', async ({ terms }) => {
    const f = await fixture(terms),
      r = await startRequest(f.list.id, 'crossword');
    expect(r.statusCode).toBe(409);
    expect(r.json<{ error: { code: string } }>().error.code).toBe(
      terms.length && !terms.includes('C++') ? 'CROSSWORD_UNAVAILABLE' : 'PUZZLE_NO_WORDS',
    );
    expect(await db.puzzleSession.count({ where: { wordListId: f.list.id } })).toBe(0);
  });
  it('retains selected-but-unplaced snapshots and explains them without pretending success', async () => {
    const f = await fixture([...terms, 'zzzzzzzzzzzzzzzzzz']);
    let s = await start(f.list.id, 'crossword');
    expect(s.omitted.some((w) => w.reason === 'layout')).toBe(true);
    expect(s.placedCount).toBeLessThan(s.selectedCount);
    expect(s.omitted.filter((w) => w.reason === 'layout').every((w) => !w.english)).toBe(true);
    s = await solve(s);
    const done = (await call(s, 'complete')).json<Reply>().session;
    expect(done.unplaced.some((w) => w.english === 'zzzzzzzzzzzzzzzzzz')).toBe(true);
  });
});
