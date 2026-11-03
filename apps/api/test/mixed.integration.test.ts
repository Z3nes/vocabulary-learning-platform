import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { createDatabase } from '../src/db/client.js';
import { resolveUser } from '../src/auth/identity.js';
import type { getPractice } from '../src/practice/service.js';
import { choiceDataSchema } from '../src/practice/mixedPlan.js';
import { englishKey, meaningKey } from '../src/vocabulary/input.js';
import { SpeechService } from '../src/speech/service.js';
import { actOnCard, startSession } from '../src/study/service.js';
import { loadLocalEnvironment, verifyTestDatabase } from './databaseSafety.js';
import { testConfig } from './helpers.js';

loadLocalEnvironment();
const targets = await verifyTestDatabase(),
  db = createDatabase(targets.runtime);
type Session = Awaited<ReturnType<typeof getPractice>>;
interface Reply {
  session: Session;
  applied: boolean;
}
let users: string[],
  apps: FastifyInstance[],
  a: FastifyInstance,
  device: FastifyInstance,
  b: FastifyInstance;
const synthesize = vi
  .fn<(s: string) => Promise<Buffer>>()
  .mockResolvedValue(Buffer.from('mock audio'));
beforeEach(async () => {
  const identities = [0, 1].map(() => ({ provider: 'test', subject: `mixed-${randomUUID()}` }));
  users = await Promise.all(identities.map((i) => resolveUser(db, i)));
  apps = [];
  for (const identity of [identities[0]!, identities[0]!, identities[1]!])
    apps.push(
      await buildApp({
        config: testConfig({ databaseUrl: targets.runtime }),
        db,
        logger: false,
        identityProvider: { resolve: () => Promise.resolve(identity) },
        speech: new SpeechService({ cacheKey: (s) => s, synthesize }, false),
      }),
    );
  [a, device, b] = apps as [FastifyInstance, FastifyInstance, FastifyInstance];
});
afterEach(async () => {
  await Promise.all(apps.map((app) => app.close()));
  await db.user.deleteMany({ where: { id: { in: users } } });
});
afterAll(async () => {
  await db.$disconnect();
});
async function fixture(size = 16, ownerId = users[0]!, pairs = false) {
  const list = await db.wordList.create({ data: { ownerId, title: 'Mixed fixture' } });
  const words = Array.from({ length: size }, (_, i) => ({
    id: randomUUID(),
    english: `term${i}`,
    meanings: [
      `anlam ${pairs ? Math.floor(i / 2) : i}`,
      `karşılık ${pairs ? Math.floor(i / 2) : i}`,
    ],
  }));
  await db.word.createMany({
    data: words.map((w) => ({
      id: w.id,
      wordListId: list.id,
      english: w.english,
      normalizedEnglishKey: englishKey(w.english),
    })),
  });
  await db.wordMeaning.createMany({
    data: words.flatMap((w) =>
      w.meanings.map((turkish, position) => ({
        wordId: w.id,
        turkish,
        position,
        normalizedMeaningKey: meaningKey(turkish),
      })),
    ),
  });
  return { list, words };
}
const startRequest = (listId: string | null, percentage = 100, app = a) =>
  app.inject({ method: 'POST', url: '/api/mixed', payload: { listId, percentage } });
async function start(listId: string | null, percentage = 100) {
  const r = await startRequest(listId, percentage);
  expect(r.statusCode, r.body).toBe(201);
  return r.json<Reply>().session;
}
const call = (s: Session, action: string, payload: object = {}, app = a) =>
  app.inject({ method: 'POST', url: `/api/practice/${s.id}/${action}`, payload });
const input = (s: Session) => ({ questionId: s.currentQuestion!.id, version: s.version });
async function command(s: Session, action: string, payload: object = {}) {
  const r = await call(s, action, payload);
  expect(r.statusCode, r.body).toBe(200);
  return r.json<Reply>().session;
}
async function resolve(s: Session, positive = true) {
  const q = await db.practiceQuestion.findUniqueOrThrow({ where: { id: s.currentQuestion!.id } });
  if (q.resolution) return s;
  if (q.activityType === 'flashcard') {
    if (!q.revealedAt) s = await command(s, 'reveal', input(s));
    return command(s, 'self-evaluation', {
      ...input(s),
      evaluation: positive ? 'known' : 'missed',
    });
  }
  if (q.activityType === 'choice') {
    const choices = choiceDataSchema.parse(q.modeData),
      optionId = positive
        ? choices.correctOptionId
        : choices.options.find((o) => o.id !== choices.correctOptionId)!.id;
    return command(s, 'choice', { ...input(s), optionId });
  }
  if (!positive && q.activityType === 'listening') return command(s, 'skip-audio', input(s));
  return command(s, 'answers', { ...input(s), answer: positive ? q.english : 'not the answer' });
}
async function reach(s: Session, mode: string) {
  while (s.currentQuestion!.activityType !== mode) {
    s = await resolve(s);
    s = await command(s, 'next', input(s));
  }
  return s;
}
async function resolved(s: Session, positive = true) {
  while (true) {
    s = await resolve(s, positive);
    if (s.currentPosition + 1 === s.questionCount) return s;
    s = await command(s, 'next', input(s));
  }
}
const progress = (wordId: string) =>
  db.wordProgress.findUnique({
    where: { wordId },
    select: { knownStreak: true, needsReview: true },
  });

describe('persistent mixed practice with real PostgreSQL', () => {
  it('isolates scopes and all mixed operations from another owner', async () => {
    const f = await fixture(),
      s = await start(f.list.id);
    expect((await startRequest(f.list.id, 100, b)).statusCode).toBe(404);
    expect((await b.inject(`/api/mixed?listId=${f.list.id}`)).statusCode).toBe(404);
    expect((await b.inject(`/api/practice/${s.id}`)).statusCode).toBe(404);
    for (const action of [
      'reveal',
      'self-evaluation',
      'choice',
      'answers',
      'next',
      'skip-audio',
      'complete',
      'cancel',
    ]) {
      const payload =
        action === 'self-evaluation'
          ? { ...input(s), evaluation: 'known' }
          : action === 'choice'
            ? { ...input(s), optionId: randomUUID() }
            : action === 'answers'
              ? { ...input(s), answer: 'term' }
              : ['complete', 'cancel'].includes(action)
                ? {}
                : input(s);
      expect((await call(s, action, payload, b)).statusCode).toBe(404);
    }
    expect(
      (await b.inject('/api/mixed')).json<{ eligibleCount: number; resumable: unknown[] }>(),
    ).toMatchObject({ eligibleCount: 0, resumable: [] });
  });
  it('uses all owned lists and freezes each source context without foreign vocabulary', async () => {
    const f = await fixture(8),
      g = await fixture(8),
      foreign = await fixture(4, users[1]);
    const s = await start(null);
    expect(s.questionCount).toBe(16);
    expect(s.listId).toBeNull();
    const qs = await db.practiceQuestion.findMany({ where: { sessionId: s.id } });
    expect(new Set(qs.map((q) => q.originListId))).toEqual(new Set([f.list.id, g.list.id]));
    expect(qs.some((q) => foreign.words.some((w) => q.sourceWordId === w.id))).toBe(false);
    expect((await device.inject('/api/mixed')).json<Reply>().session.id).toBe(s.id);
    expect((await device.inject(`/api/practice/${s.id}`)).json<Reply>().session).toEqual(s);
  });
  it('serializes starts and keeps global/list/mode scopes independent with partial uniqueness', async () => {
    const f = await fixture(),
      g = await fixture();
    const starts = await Promise.all([
      startRequest(f.list.id),
      startRequest(f.list.id, 100, device),
    ]);
    expect(starts.map((r) => r.statusCode).sort()).toEqual([201, 409]);
    await start(null);
    await start(g.list.id);
    expect(
      (
        await a.inject({
          method: 'POST',
          url: `/api/lists/${f.list.id}/practice`,
          payload: { percentage: 100, practiceType: 'listening' },
        })
      ).statusCode,
    ).toBe(201);
    const row = await db.practiceSession.findFirstOrThrow({
        where: { wordListId: f.list.id, practiceType: 'mixed' },
      }),
      { id: _id, ...data } = row;
    await expect(db.practiceSession.create({ data })).rejects.toMatchObject({ code: 'P2002' });
    const global = await db.practiceSession.findFirstOrThrow({
        where: { ownerId: users[0]!, scopeKey: 'ALL_LISTS' },
      }),
      { id: _globalId, ...globalData } = global;
    await expect(db.practiceSession.create({ data: globalData })).rejects.toMatchObject({
      code: 'P2002',
    });
  });
  it.each([15, 25, 50, 100])(
    'rounds a large selected pool at %i without a cap or duplicate identities',
    async (p) => {
      const f = await fixture(250),
        s = await start(f.list.id, p);
      expect(s.questionCount).toBe(Math.ceil((250 * p) / 100));
      const qs = await db.practiceQuestion.findMany({ where: { sessionId: s.id } });
      expect(new Set(qs.map((q) => q.sourceWordId)).size).toBe(s.questionCount);
      expect(new Set(qs.map((q) => q.activityType)).size).toBe(4);
    },
  );
  it('handles empty/tiny pools honestly and rejects unsupported percentages/forged scope', async () => {
    const empty = await fixture(0);
    expect((await startRequest(empty.list.id)).statusCode).toBe(409);
    const tiny = await fixture(1),
      s = await start(tiny.list.id, 15);
    expect(s.questionCount).toBe(1);
    expect(s.currentQuestion!.activityType).not.toBe('choice');
    for (const percentage of [-1, 0, 16, 26, 101])
      expect((await startRequest(tiny.list.id, percentage)).statusCode).toBe(400);
    expect(
      (
        await a.inject({
          method: 'POST',
          url: '/api/mixed',
          payload: { listId: null, percentage: 100, ownerId: users[1], scopeKey: 'ALL' },
        })
      ).statusCode,
    ).toBe(400);
  });
  it('freezes assignments, meanings, options and titles through edits and list/word deletion', async () => {
    const f = await fixture(),
      s = await start(f.list.id),
      before = await db.practiceQuestion.findMany({
        where: { sessionId: s.id },
        orderBy: { position: 'asc' },
      });
    await db.word.update({ where: { id: f.words[0]!.id }, data: { english: 'edited' } });
    await db.wordList.update({ where: { id: f.list.id }, data: { title: 'renamed' } });
    await db.wordList.delete({ where: { id: f.list.id } });
    const after = await db.practiceQuestion.findMany({
      where: { sessionId: s.id },
      orderBy: { position: 'asc' },
    });
    expect(after.map(({ wordId: _wordId, ...q }) => q)).toEqual(
      before.map(({ wordId: _wordId, ...q }) => q),
    );
    const resumed = (await device.inject(`/api/practice/${s.id}`)).json<Reply>().session;
    expect(resumed.listTitle).toBe('Mixed fixture');
    expect(resumed.listId).toBeNull();
    const setup = (await device.inject('/api/mixed')).json<{ resumable: { id: string }[] }>();
    expect(setup.resumable.some((r) => r.id === s.id)).toBe(true);
    const done = await resolved(resumed);
    expect((await call(done, 'complete')).json<Reply>().session.masteryAppliedCount).toBe(0);
  });
  it('requires deliberate card reveal and distinguishes known/missed self reports from correctness', async () => {
    const f = await fixture();
    let s = await reach(await start(f.list.id), 'flashcard');
    expect(s.currentQuestion!.meanings).toEqual([]);
    expect(s.currentQuestion!.prompt).toBeTruthy();
    expect(
      (await call(s, 'self-evaluation', { ...input(s), evaluation: 'known' })).statusCode,
    ).toBe(409);
    const revealInput = input(s);
    s = await command(s, 'reveal', revealInput);
    expect((await call(s, 'reveal', revealInput, device)).json<Reply>().applied).toBe(false);
    expect(s.currentQuestion!.meanings).toHaveLength(2);
    const payload = { ...input(s), evaluation: 'known' };
    s = await command(s, 'self-evaluation', payload);
    expect(s.currentQuestion!.evaluation).toMatchObject({
      correct: null,
      masteryEligible: true,
      feedback: 'self',
    });
    expect((await call(s, 'self-evaluation', payload, device)).json<Reply>().applied).toBe(false);
    expect(
      (await call(s, 'self-evaluation', { ...input(s), evaluation: 'missed' })).statusCode,
    ).toBe(409);
    expect(s.selfKnownCount).toBe(1);
  });
  it('preserves complete-set alternatives without credit and exact-target eligibility in written rounds', async () => {
    const f = await fixture(32, users[0], true);
    let s = await reach(await start(f.list.id), 'written-recall');
    const q = await db.practiceQuestion.findUniqueOrThrow({ where: { id: s.currentQuestion!.id } });
    const alternative = q.acceptedAnswers.find((a) => a !== englishKey(q.english))!;
    expect(alternative).toBeTruthy();
    s = await command(s, 'answers', { ...input(s), answer: alternative });
    expect(s.currentQuestion!.evaluation).toMatchObject({
      correct: true,
      masteryEligible: false,
      feedback: 'alternative',
    });
    expect((await call(s, 'answers', { ...input(s), answer: q.english })).statusCode).toBe(409);
    expect(await progress(q.sourceWordId)).toBeNull();
    s = await resolved(s);
    await command(s, 'complete');
    expect(await progress(q.sourceWordId)).toBeNull();
  });
  it('keeps listening targets hidden, uses authorized snapshot audio and exact-only evaluation', async () => {
    const f = await fixture(32, users[0], true);
    let s = await reach(await start(f.list.id), 'listening');
    const q = await db.practiceQuestion.findUniqueOrThrow({ where: { id: s.currentQuestion!.id } });
    expect(s.currentQuestion).not.toHaveProperty('prompt');
    expect(s.currentQuestion!.evaluation).toBeNull();
    const url = `/api/practice/${s.id}/questions/${q.id}/audio`;
    expect((await b.inject({ method: 'POST', url, payload: {} })).statusCode).toBe(404);
    const audio = await a.inject({ method: 'POST', url, payload: { provider: 'browser' } });
    expect(audio.statusCode).toBe(200);
    expect(audio.json<{ text: string }>().text).toBe(q.english);
    const sameMeaning = f.words.find(
      (w) => w.id !== q.sourceWordId && w.meanings.join() === q.meanings.join(),
    )!;
    s = await command(s, 'answers', { ...input(s), answer: sameMeaning.english });
    expect(s.currentQuestion!.evaluation).toMatchObject({ correct: false, masteryEligible: false });
    expect((await a.inject({ method: 'POST', url, payload: {} })).statusCode).toBe(409);
  });
  it('validates stored options, hides the correct ID, rejects mode bypass and awards no choice credit', async () => {
    const f = await fixture();
    let s = await reach(await start(f.list.id), 'choice');
    const q = await db.practiceQuestion.findUniqueOrThrow({ where: { id: s.currentQuestion!.id } }),
      choices = choiceDataSchema.parse(q.modeData);
    expect(s.currentQuestion!.options).toEqual(choices.options);
    expect(s.currentQuestion).not.toHaveProperty('correctOptionId');
    expect(s.currentQuestion!.meanings).toEqual([]);
    expect((await call(s, 'choice', { ...input(s), optionId: randomUUID() })).statusCode).toBe(400);
    for (const [action, payload] of [
      ['answers', { ...input(s), answer: q.english }],
      ['self-evaluation', { ...input(s), evaluation: 'known' }],
      ['skip-audio', input(s)],
      ['reveal', input(s)],
    ] as const)
      expect((await call(s, action, payload)).statusCode).toBe(409);
    s = await command(s, 'choice', { ...input(s), optionId: choices.correctOptionId });
    expect(s.currentQuestion!.evaluation).toMatchObject({
      correct: true,
      masteryEligible: false,
      feedback: 'choice',
    });
    expect(s.currentQuestion!.correctOptionId).toBe(choices.correctOptionId);
  });
  it('persists no-penalty audio skips and forbids stale/out-of-order writes', async () => {
    const f = await fixture();
    let s = await reach(await start(f.list.id), 'listening');
    const payload = input(s);
    expect((await call(s, 'skip-audio', { ...payload, version: 999 })).statusCode).toBe(409);
    s = await command(s, 'skip-audio', payload);
    expect((await call(s, 'skip-audio', payload, device)).json<Reply>().applied).toBe(false);
    expect(s.currentQuestion!.resolution).toBe('audio_unavailable');
    expect(s.currentQuestion!.evaluation).toBeNull();
    expect((await call(s, 'answers', { ...input(s), answer: 'term' })).statusCode).toBe(409);
    expect((await device.inject(`/api/practice/${s.id}`)).json<Reply>().session).toEqual(s);
  });
  it('creates one immutable mixed history and one set of eligible positives under concurrent completion', async () => {
    const f = await fixture(),
      s = await resolved(await start(f.list.id));
    expect(await db.wordProgress.count({ where: { word: { wordListId: f.list.id } } })).toBe(0);
    const results = await Promise.all([call(s, 'complete'), call(s, 'complete', {}, device)]);
    expect(results.map((r) => r.json<Reply>().applied).sort()).toEqual([false, true]);
    const done = results[0].json<Reply>().session;
    expect(done.masteryAppliedCount).toBe(12);
    expect(done.selfKnownCount).toBe(4);
    expect(done.correctCount).toBe(12);
    expect(done.incorrectCount).toBe(0);
    const history = await db.completedGame.findMany({
      where: { ownerId: users[0]!, completionId: s.id },
    });
    expect(history).toHaveLength(1);
    expect(history[0]!.gameType).toBe('mixed');
    expect(history[0]!.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          outcome: 'self_known',
          activityType: 'flashcard',
          originListTitle: 'Mixed fixture',
        }),
      ]),
    );
    const snapshot = history[0]!.items;
    await db.wordList.delete({ where: { id: f.list.id } });
    expect(
      (await db.completedGame.findUniqueOrThrow({ where: { id: history[0]!.id } })).items,
    ).toEqual(snapshot);
    expect((await device.inject('/api/activity')).body).toContain('mixed');
  });
  it('applies no penalties or new progress for wrong/skip/missed rounds and never completes prematurely', async () => {
    const f = await fixture();
    for (const w of f.words)
      await db.wordProgress.create({ data: { wordId: w.id, needsReview: true, knownStreak: 1 } });
    const before = await db.wordProgress.findMany({
      where: { word: { wordListId: f.list.id } },
      orderBy: { wordId: 'asc' },
    });
    let s = await start(f.list.id);
    expect((await call(s, 'complete')).statusCode).toBe(409);
    s = await resolved(s, false);
    s = await command(s, 'complete');
    expect(s.masteryAppliedCount).toBe(0);
    expect(s.selfMissedCount).toBe(4);
    expect(s.skippedCount).toBe(4);
    expect(
      await db.wordProgress.findMany({
        where: { word: { wordListId: f.list.id } },
        orderBy: { wordId: 'asc' },
      }),
    ).toEqual(before);
  });
  it('cancels without history/credit and serializes cancellation versus completion', async () => {
    const f = await fixture();
    let s = await resolved(await start(f.list.id));
    const result = await Promise.all([call(s, 'cancel'), call(s, 'complete', {}, device)]);
    expect(result.map((r) => r.statusCode).sort()).toEqual([200, 409]);
    s = (await a.inject(`/api/practice/${s.id}`)).json<Reply>().session;
    expect(await db.completedGame.count({ where: { completionId: s.id } })).toBe(
      s.status === 'COMPLETED' ? 1 : 0,
    );
    const fresh = await start(f.list.id);
    await command(fresh, 'cancel');
    expect((await call(fresh, 'complete')).statusCode).toBe(409);
    expect(await db.completedGame.count({ where: { completionId: fresh.id } })).toBe(0);
  });
  it('preserves the two distinct sessions rule and serializes completion after intervening flashcard misses', async () => {
    const f = await fixture(1);
    let s = await start(f.list.id);
    const q = await db.practiceQuestion.findUniqueOrThrow({ where: { id: s.currentQuestion!.id } });
    // Tiny random rounds can be any credit-eligible basic mode, resolved consistently.
    s = await resolved(s);
    const flash = await startSession(db, users[0]!, f.list.id, {
      direction: 'en-tr',
      percentage: 100,
    });
    await actOnCard(db, users[0]!, flash.id, {
      cardId: flash.currentCard!.id,
      version: flash.version,
      action: 'missed',
    });
    await command(s, 'complete');
    expect(await progress(q.sourceWordId)).toEqual({ needsReview: true, knownStreak: 1 });
    await call(s, 'complete', {}, device);
    expect(await progress(q.sourceWordId)).toEqual({ needsReview: true, knownStreak: 1 });
    const second = await resolved(await start(f.list.id));
    await command(second, 'complete');
    expect(await progress(q.sourceWordId)).toEqual({ needsReview: false, knownStreak: 2 });
  });
  it('credits all-lists targets on their correct origins only and does not double count same spelling', async () => {
    const f = await fixture(1),
      g = await fixture(1),
      s = await resolved(await start(null));
    await command(s, 'complete');
    expect(await progress(f.words[0]!.id)).toEqual({ needsReview: false, knownStreak: 1 });
    expect(await progress(g.words[0]!.id)).toEqual({ needsReview: false, knownStreak: 1 });
  });
  it('rolls back progress, credit markers and terminal state when history insertion fails', async () => {
    const f = await fixture(),
      s = await resolved(await start(f.list.id));
    const injected = await db.completedGame.create({
      data: {
        ownerId: users[0]!,
        completionId: s.id,
        listTitle: 'Failure fixture',
        gameType: 'quiz',
        requestHash: 'fixture',
        items: [{}],
      },
    });
    expect((await call(s, 'complete')).statusCode).toBe(500);
    expect(await db.wordProgress.count({ where: { word: { wordListId: f.list.id } } })).toBe(0);
    expect((await a.inject(`/api/practice/${s.id}`)).json<Reply>().session).toEqual(s);
    await db.completedGame.delete({ where: { id: injected.id } });
    expect((await call(s, 'complete')).statusCode).toBe(200);
  });
  it('rejects invalid mixed metadata/self/choice/mastery states at the SQL boundary', async () => {
    const f = await fixture();
    const s = await reach(await start(f.list.id), 'choice');
    const q = s.currentQuestion!.id;
    for (const data of [
      { modeData: {} },
      { originListId: null },
      { activityType: 'invented' },
      { revealedAt: new Date() },
      { masteryEligible: true },
    ])
      await expect(db.practiceQuestion.update({ where: { id: q }, data })).rejects.toBeDefined();
    await command(s, 'choice', {
      ...input(s),
      optionId: choiceDataSchema.parse(
        (await db.practiceQuestion.findUniqueOrThrow({ where: { id: q } })).modeData,
      ).correctOptionId,
    });
    await expect(
      db.practiceQuestion.update({ where: { id: q }, data: { masteryEligible: true } }),
    ).rejects.toBeDefined();
  });
});
