import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { resolveUser } from '../src/auth/identity.js';
import { createDatabase } from '../src/db/client.js';
import { finishPractice, getPractice } from '../src/practice/service.js';
import { actOnCard, startSession } from '../src/study/service.js';
import { englishKey, meaningKey } from '../src/vocabulary/input.js';
import { loadLocalEnvironment, verifyTestDatabase } from './databaseSafety.js';
import { testConfig } from './helpers.js';

loadLocalEnvironment();
const targets = await verifyTestDatabase();
const db = createDatabase(targets.runtime);
const identities = [0, 1].map(() => ({ provider: 'test', subject: `practice-${randomUUID()}` }));
const users: string[] = [];
const apps: FastifyInstance[] = [];
type Session = Awaited<ReturnType<typeof getPractice>>;
interface Reply {
  session: Session;
  applied: boolean;
  count: number;
  activities: { key: string }[];
}
let a: FastifyInstance;
let device: FastifyInstance;
let b: FastifyInstance;
beforeAll(async () => {
  await db.practiceSession.count();
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
async function fixture(
  entries = [{ english: 'algorithm', meanings: ['algoritma', 'işlem yolu'] }],
  ownerId = users[0]!,
) {
  const list = await db.wordList.create({ data: { ownerId, title: 'Practice fixture' } });
  const words = [];
  for (const entry of entries)
    words.push(
      await db.word.create({
        data: {
          wordListId: list.id,
          english: entry.english,
          normalizedEnglishKey: englishKey(entry.english),
          meanings: {
            create: entry.meanings.map((turkish, position) => ({
              turkish,
              position,
              normalizedMeaningKey: meaningKey(turkish),
            })),
          },
        },
      }),
    );
  return { list, words };
}
const call = (sessionId: string, action: string, payload: object = {}, app = a) =>
  app.inject({ method: 'POST', url: `/api/practice/${sessionId}/${action}`, payload });
async function start(listId: string, percentage = 100, app = a) {
  const result = await app.inject({
    method: 'POST',
    url: `/api/lists/${listId}/practice`,
    payload: { percentage },
  });
  expect(result.statusCode).toBe(201);
  return result.json<{ session: Session }>().session;
}
async function submit(session: Session, answer = 'algorithm', app = a) {
  const result = await call(
    session.id,
    'answers',
    { questionId: session.currentQuestion!.id, version: session.version, answer },
    app,
  );
  expect(result.statusCode).toBe(200);
  return result.json<{ session: Session }>().session;
}
async function resolveAll(session: Session) {
  while (session.currentQuestion) {
    const stored = await db.practiceQuestion.findUniqueOrThrow({
      where: { id: session.currentQuestion.id },
    });
    session = await submit(session, stored.english);
    const next = await call(session.id, 'next', {
      questionId: session.currentQuestion!.id,
      version: session.version,
    });
    expect(next.statusCode).toBe(200);
    session = next.json<{ session: Session }>().session;
  }
  return session;
}
const progress = (wordId: string) =>
  db.wordProgress.findUnique({
    where: { wordId },
    select: { needsReview: true, knownStreak: true },
  });
async function flash(listId: string, action: 'known' | 'missed', reviewOnly = false) {
  const session = await startSession(db, users[0]!, listId, {
    direction: 'en-tr',
    percentage: 100,
    reviewOnly,
  });
  return actOnCard(db, users[0]!, session.id, {
    cardId: session.currentCard!.id,
    version: session.version,
    action,
  });
}

describe('server-authoritative persistent written recall', () => {
  it('requires authentication and rejects an empty owned list', async () => {
    const unauthenticated = await buildApp({ config: testConfig(), logger: false });
    try {
      expect((await unauthenticated.inject(`/api/practice/${randomUUID()}`)).statusCode).toBe(401);
      expect(
        (
          await unauthenticated.inject({
            method: 'POST',
            url: `/api/practice/${randomUUID()}/complete`,
            payload: {},
          })
        ).statusCode,
      ).toBe(401);
    } finally {
      await unauthenticated.close();
    }
    const { list } = await fixture([]);
    expect(
      (
        await a.inject({
          method: 'POST',
          url: `/api/lists/${list.id}/practice`,
          payload: { percentage: 100 },
        })
      ).statusCode,
    ).toBe(409);
  });
  it('database uniqueness handles nullable global scopes and independent practice types', async () => {
    const { list } = await fixture();
    const s = await start(list.id);
    const row = await db.practiceSession.findUniqueOrThrow({ where: { id: s.id } });
    const { id: _id, ...data } = row;
    await db.practiceSession.create({ data: { ...data, wordListId: null, scopeKey: 'ALL_LISTS' } });
    await expect(
      db.practiceSession.create({ data: { ...data, wordListId: null, scopeKey: 'ALL_LISTS' } }),
    ).rejects.toMatchObject({ code: 'P2002' });
    // Storage-level extensibility only; no route registers this test-only type.
    await db.practiceSession.create({ data: { ...data, practiceType: 'fixture-other' } });
  });
  it('completes more than ten questions without a cap and persists all history results', async () => {
    const { list } = await fixture(
      Array.from({ length: 20 }, (_, i) => ({ english: `word${i}`, meanings: [`anlam${i}`] })),
    );
    const s = await resolveAll(await start(list.id));
    const result = await finishPractice(db, users[0]!, s.id);
    expect(result.session.results).toHaveLength(20);
    expect(result.session.masteryAppliedCount).toBe(20);
    const game = await db.completedGame.findFirstOrThrow({ where: { completionId: s.id } });
    expect(game.items).toHaveLength(20);
  });
  it('resumes immutable questions and their stable randomized order on another device', async () => {
    const { list, words } = await fixture(
      Array.from({ length: 20 }, (_, i) => ({
        english: `term${i}`,
        meanings: [`anlam${i}`, `karşılık${i}`],
      })),
    );
    const s = await start(list.id, 15);
    expect(s.questionCount).toBe(3);
    expect(s.eligibleCount).toBe(20);
    const before = await db.practiceQuestion.findMany({
      where: { sessionId: s.id },
      orderBy: { position: 'asc' },
    });
    expect(new Set(before.map((q) => q.wordId)).size).toBe(3);
    expect(s.currentQuestion!.evaluation).toBeNull();
    expect(JSON.stringify(s)).not.toContain('acceptedAnswers');
    expect(JSON.stringify(s)).not.toContain('term');
    await db.word.update({ where: { id: before[0]!.wordId! }, data: { english: 'edited' } });
    const resumed = await device.inject(`/api/practice/${s.id}`);
    expect(resumed.json<Reply>().session).toEqual(s);
    const active = await device.inject(`/api/lists/${list.id}/practice/active`);
    expect(active.json<Reply>().session.id).toBe(s.id);
    expect(
      await db.practiceQuestion.findMany({
        where: { sessionId: s.id },
        orderBy: { position: 'asc' },
      }),
    ).toEqual(before);
    expect(words).toHaveLength(20);
  });
  it('serializes simultaneous starts, allows other lists, and enforces uniqueness in PostgreSQL', async () => {
    const { list } = await fixture();
    const responses = await Promise.all(
      [a, device].map((app) =>
        app.inject({
          method: 'POST',
          url: `/api/lists/${list.id}/practice`,
          payload: { percentage: 100 },
        }),
      ),
    );
    expect(responses.map((r) => r.statusCode).sort()).toEqual([201, 409]);
    const active = await db.practiceSession.findFirstOrThrow({
      where: { wordListId: list.id, status: 'ACTIVE' },
    });
    const { id: _id, ...data } = active;
    await expect(db.practiceSession.create({ data })).rejects.toMatchObject({ code: 'P2002' });
    const other = await fixture();
    expect((await start(other.list.id)).status).toBe('ACTIVE');
  });
  it('persists one first attempt; compatible retries replay, replacements conflict across tabs', async () => {
    const { list, words } = await fixture();
    const s = await start(list.id);
    const payload = { questionId: s.currentQuestion!.id, version: s.version, answer: 'Algorithm' };
    const results = await Promise.all(
      [a, device].map((app) => call(s.id, 'answers', payload, app)),
    );
    expect(results.every((r) => r.statusCode === 200)).toBe(true);
    expect(results.map((r) => r.json<Reply>().applied).sort()).toEqual([false, true]);
    expect((await call(s.id, 'answers', { ...payload, answer: 'wrong' })).statusCode).toBe(409);
    const resumed = (await device.inject(`/api/practice/${s.id}`)).json<Reply>().session;
    expect(resumed.currentQuestion!.evaluation).toMatchObject({
      answer: 'Algorithm',
      correct: true,
      masteryEligible: true,
    });
    expect(await progress(words[0]!.id)).toBeNull();
  });
  it('rejects stale versions, foreign question IDs and out-of-order submissions', async () => {
    const { list } = await fixture([
      { english: 'one', meanings: ['bir'] },
      { english: 'two', meanings: ['iki'] },
    ]);
    const s = await start(list.id);
    const rows = await db.practiceQuestion.findMany({
      where: { sessionId: s.id },
      orderBy: { position: 'asc' },
    });
    for (const payload of [
      { questionId: rows[1]!.id, version: 0, answer: 'two' },
      { questionId: rows[0]!.id, version: 99, answer: 'one' },
      { questionId: randomUUID(), version: 0, answer: 'one' },
    ])
      expect((await call(s.id, 'answers', payload)).statusCode).toBe(409);
    expect((await call(s.id, 'next', { questionId: rows[0]!.id, version: 0 })).statusCode).toBe(
      409,
    );
    expect((await call(s.id, 'complete')).statusCode).toBe(409);
  });
  it('advances only evaluated questions and retries next idempotently', async () => {
    const { list } = await fixture([
      { english: 'one', meanings: ['bir'] },
      { english: 'two', meanings: ['iki'] },
    ]);
    const s = await submit(await start(list.id), 'wrong');
    const payload = { questionId: s.currentQuestion!.id, version: s.version };
    const results = await Promise.all([a, device].map((app) => call(s.id, 'next', payload, app)));
    expect(results.map((r) => r.json<Reply>().applied).sort()).toEqual([false, true]);
    expect(results[0]!.json<Reply>().session.currentPosition).toBe(1);
    expect(
      (await call(s.id, 'answers', { ...payload, answer: 'wrong' })).json<Reply>().applied,
    ).toBe(false);
  });
  it('cancellation is durable, never credits/history, blocks completion, and permits replacement', async () => {
    const { list, words } = await fixture();
    const s = await submit(await start(list.id));
    expect((await call(s.id, 'cancel')).json<Reply>().session.status).toBe('CANCELED');
    expect((await call(s.id, 'cancel')).json<Reply>().applied).toBe(false);
    expect((await call(s.id, 'complete')).statusCode).toBe(409);
    expect(
      (
        await call(s.id, 'answers', {
          questionId: s.currentQuestion!.id,
          version: s.version,
          answer: 'algorithm',
        })
      ).statusCode,
    ).toBe(409);
    expect(await progress(words[0]!.id)).toBeNull();
    expect(await db.completedGame.count({ where: { completionId: s.id } })).toBe(0);
    expect((await start(list.id)).id).not.toBe(s.id);
  });
  it('completion retries and simultaneous tabs credit and record history exactly once', async () => {
    const { list, words } = await fixture();
    const s = await submit(await start(list.id));
    const results = await Promise.all([a, device].map((app) => call(s.id, 'complete', {}, app)));
    expect(results.map((r) => r.json<Reply>().applied).sort()).toEqual([false, true]);
    expect(await progress(words[0]!.id)).toEqual({ knownStreak: 1, needsReview: false });
    const saved = results[0]!.json<Reply>().session;
    expect(saved.masteryAppliedCount).toBe(1);
    expect((await call(s.id, 'complete')).json<Reply>().session).toEqual(saved);
    expect((await call(s.id, 'cancel')).statusCode).toBe(409);
    expect(
      (await call(s.id, 'next', { questionId: s.currentQuestion!.id, version: s.version }))
        .statusCode,
    ).toBe(409);
    expect(await db.completedGame.count({ where: { completionId: s.id } })).toBe(1);
    const game = await db.completedGame.findFirstOrThrow({ where: { completionId: s.id } });
    expect(
      (await a.inject('/api/activity'))
        .json<Reply>()
        .activities.some((r: { key: string }) => r.key === `game:${game.id}`),
    ).toBe(true);
    expect(game.gameType).toBe('written-recall');
  });
  it('completion/cancellation races yield one final outcome without partial credit', async () => {
    const { list, words } = await fixture();
    const s = await submit(await start(list.id));
    const results = await Promise.all([call(s.id, 'complete'), call(s.id, 'cancel', {}, device)]);
    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 409]);
    const final = await getPractice(db, users[0]!, s.id);
    const completed = final.status === 'COMPLETED';
    expect(await db.completedGame.count({ where: { completionId: s.id } })).toBe(completed ? 1 : 0);
    expect((await progress(words[0]!.id))?.knownStreak ?? 0).toBe(completed ? 1 : 0);
  });
  it('rolls back learning changes when the history insert fails', async () => {
    const { list, words } = await fixture();
    const s = await submit(await start(list.id));
    await db.completedGame.create({
      data: {
        ownerId: users[0]!,
        completionId: s.id,
        wordListId: list.id,
        listTitle: list.title,
        gameType: 'quiz',
        requestHash: 'fixture',
        items: [
          {
            wordId: words[0]!.id,
            english: 'algorithm',
            meanings: ['algoritma'],
            outcome: 'correct',
            attempts: 1,
          },
        ],
      },
    });
    expect((await call(s.id, 'complete')).statusCode).toBe(500);
    expect(await progress(words[0]!.id)).toBeNull();
    expect((await getPractice(db, users[0]!, s.id)).status).toBe('ACTIVE');
    expect(
      await db.practiceQuestion.count({ where: { sessionId: s.id, masteryApplied: true } }),
    ).toBe(0);
  });
  it('freezes complete-set alternatives and distinguishes partial overlap without mastery', async () => {
    const { list } = await fixture([
      { english: 'big', meanings: ['büyük'] },
      { english: 'large', meanings: ['BÜYÜK'] },
      { english: 'huge', meanings: ['büyük', 'iri'] },
    ]);
    const s = await start(list.id);
    const questions = await db.practiceQuestion.findMany({
      where: { sessionId: s.id },
      orderBy: { position: 'asc' },
    });
    const first = questions[0]!;
    const answer = first.english === 'huge' ? 'big' : first.english === 'big' ? 'large' : 'big';
    await db.wordMeaning.deleteMany({ where: { wordId: { in: questions.map((q) => q.wordId!) } } });
    const evaluated = await submit(s, answer);
    expect(evaluated.currentQuestion!.meanings).toEqual(first.meanings);
    expect(evaluated.currentQuestion!.evaluation).toMatchObject({
      correct: first.english !== 'huge',
      masteryEligible: false,
      feedback: first.english === 'huge' ? 'overlap' : 'alternative',
    });
    expect(await db.wordProgress.count({ where: { word: { wordListId: list.id } } })).toBe(0);
  });
  it('rejects foreign ownership on every lifecycle endpoint and hides foreign lists', async () => {
    const { list } = await fixture();
    const s = await start(list.id);
    expect((await b.inject(`/api/practice/${s.id}`)).statusCode).toBe(404);
    for (const action of ['complete', 'cancel'])
      expect((await call(s.id, action, {}, b)).statusCode).toBe(404);
    expect(
      (
        await call(
          s.id,
          'answers',
          { questionId: s.currentQuestion!.id, version: 0, answer: 'algorithm' },
          b,
        )
      ).statusCode,
    ).toBe(404);
    expect(
      (await call(s.id, 'next', { questionId: s.currentQuestion!.id, version: 0 }, b)).statusCode,
    ).toBe(404);
    expect((await b.inject(`/api/lists/${list.id}/practice/active`)).statusCode).toBe(404);
    expect(
      (
        await b.inject({
          method: 'POST',
          url: `/api/lists/${list.id}/practice`,
          payload: { percentage: 100 },
        })
      ).statusCode,
    ).toBe(404);
  });
  it('strictly rejects client correctness, scope, unsupported percentages and malformed submissions', async () => {
    const { list } = await fixture();
    for (const payload of [
      { percentage: 10 },
      { percentage: 100, scopeKey: 'ALL_LISTS' },
      { percentage: 100, practiceType: 'dictation' },
    ])
      expect(
        (await a.inject({ method: 'POST', url: `/api/lists/${list.id}/practice`, payload }))
          .statusCode,
      ).toBe(400);
    const s = await start(list.id);
    const body = { questionId: s.currentQuestion!.id, version: 0, answer: 'algorithm' };
    for (const payload of [
      { ...body, correct: true },
      { ...body, masteryEligible: true },
      { ...body, answer: '' },
      { ...body, answer: ' '.repeat(5) },
      { ...body, version: -1 },
      { ...body, answer: 'x'.repeat(501) },
    ])
      expect((await call(s.id, 'answers', payload)).statusCode).toBe(400);
    expect((await call(s.id, 'complete', { correctCount: 1 })).statusCode).toBe(400);
    expect(
      (
        await a.inject({
          method: 'POST',
          url: '/api/games/completions',
          payload: {
            completionId: randomUUID(),
            listId: list.id,
            gameType: 'written-recall',
            status: 'completed',
            items: [],
          },
        })
      ).statusCode,
    ).toBe(400);
  });
  it('keeps deleted word snapshots readable and does not recreate their progress', async () => {
    const { list, words } = await fixture();
    const s = await submit(await start(list.id));
    await db.word.delete({ where: { id: words[0]!.id } });
    const completed = await finishPractice(db, users[0]!, s.id);
    expect(completed.session.results[0]!.evaluation!.english).toBe('algorithm');
    expect(completed.session.masteryAppliedCount).toBe(0);
    expect(await progress(words[0]!.id)).toBeNull();
  });
  it('preserves session and history snapshots across list deletion', async () => {
    const { list } = await fixture();
    const s = await submit(await start(list.id));
    await db.wordList.delete({ where: { id: list.id } });
    const completed = await finishPractice(db, users[0]!, s.id);
    expect(completed.session.listId).toBeNull();
    expect(completed.session.masteryAppliedCount).toBe(0);
    expect(completed.session.listTitle).toBe(list.title);
    expect(await db.completedGame.count({ where: { completionId: s.id, wordListId: null } })).toBe(
      1,
    );
  });
  it('serializes source deletion against completion without dangling progress or broken snapshots', async () => {
    const { list, words } = await fixture();
    const s = await submit(await start(list.id));
    const results = await Promise.all([
      call(s.id, 'complete'),
      a.inject({ method: 'DELETE', url: `/api/lists/${list.id}/words/${words[0]!.id}` }),
    ]);
    expect(results.map((r) => r.statusCode)).toEqual([200, 204]);
    expect(await progress(words[0]!.id)).toBeNull();
    expect((await getPractice(db, users[0]!, s.id)).results[0]!.evaluation!.english).toBe(
      'algorithm',
    );
  });
});

describe('asymmetric learning evidence and server completion ordering', () => {
  it('never derives accepted alternatives from another list or another owner', async () => {
    const local = await fixture([{ english: 'big', meanings: ['büyük'] }]);
    await fixture([{ english: 'large', meanings: ['büyük'] }]);
    await fixture([{ english: 'huge', meanings: ['büyük'] }], users[1]);
    const s = await submit(await start(local.list.id), 'large');
    expect(s.currentQuestion!.evaluation).toMatchObject({
      correct: false,
      masteryEligible: false,
      feedback: 'incorrect',
    });
    const done = await finishPractice(db, users[0]!, s.id);
    expect(done.session.masteryAppliedCount).toBe(0);
  });
  it('clears active priority with two distinct completed exact-target sessions and permits historical sessions', async () => {
    const { list, words } = await fixture();
    await flash(list.id, 'missed');
    expect(await progress(words[0]!.id)).toEqual({ needsReview: true, knownStreak: 0 });
    const first = await submit(await start(list.id));
    expect(await progress(words[0]!.id)).toEqual({ needsReview: true, knownStreak: 0 });
    await call(first.id, 'complete');
    expect(await progress(words[0]!.id)).toEqual({ needsReview: true, knownStreak: 1 });
    const second = await submit(await start(list.id));
    await call(second.id, 'complete');
    expect(await progress(words[0]!.id)).toEqual({ needsReview: false, knownStreak: 2 });
    expect(
      await db.practiceSession.count({ where: { wordListId: list.id, status: 'COMPLETED' } }),
    ).toBe(2);
  });
  it('ignores an intervening wrong completed game between flashcard and game positives', async () => {
    const { list, words } = await fixture();
    await flash(list.id, 'missed');
    await flash(list.id, 'known');
    const wrong = await submit(await start(list.id), 'algoritm');
    await call(wrong.id, 'complete');
    expect(await progress(words[0]!.id)).toEqual({ needsReview: true, knownStreak: 1 });
    const correct = await submit(await start(list.id));
    await call(correct.id, 'complete');
    expect(await progress(words[0]!.id)).toEqual({ needsReview: false, knownStreak: 2 });
  });
  it('wrong games never activate review or reset established successes', async () => {
    const { list, words } = await fixture();
    const wrong = await submit(await start(list.id), 'wrong');
    await call(wrong.id, 'complete');
    expect(await progress(words[0]!.id)).toBeNull();
    await flash(list.id, 'known');
    const wrongAgain = await submit(await start(list.id), 'wrong');
    await call(wrongAgain.id, 'complete');
    expect(await progress(words[0]!.id)).toEqual({ needsReview: false, knownStreak: 1 });
  });
  it('applies an earlier-started game at completion after later flashcard negative evidence', async () => {
    const { list, words } = await fixture();
    const earlier = await submit(await start(list.id));
    await flash(list.id, 'known');
    await flash(list.id, 'missed');
    expect(await progress(words[0]!.id)).toEqual({ needsReview: true, knownStreak: 0 });
    const done = (await call(earlier.id, 'complete')).json<Reply>().session;
    expect(Date.parse(String(done.completedAt))).toBeGreaterThanOrEqual(
      Date.parse(String(earlier.createdAt)),
    );
    expect(await progress(words[0]!.id)).toEqual({ needsReview: true, knownStreak: 1 });
    const later = await submit(await start(list.id));
    await call(later.id, 'complete');
    expect(await progress(words[0]!.id)).toEqual({ needsReview: false, knownStreak: 2 });
  });
  it('serializes concurrent flashcard and game positives with no lost streak update', async () => {
    const { list, words } = await fixture();
    await flash(list.id, 'missed');
    const game = await submit(await start(list.id));
    const card = await startSession(db, users[0]!, list.id, {
      percentage: 100,
      direction: 'tr-en',
    });
    await Promise.all([
      finishPractice(db, users[0]!, game.id),
      actOnCard(db, users[0]!, card.id, {
        cardId: card.currentCard!.id,
        version: card.version,
        action: 'known',
      }),
    ]);
    expect(await progress(words[0]!.id)).toEqual({ needsReview: false, knownStreak: 2 });
  });
  it('correct complete-set alternatives never credit either vocabulary identity', async () => {
    const { list, words } = await fixture([
      { english: 'big', meanings: ['büyük'] },
      { english: 'large', meanings: ['büyük'] },
    ]);
    let s = await start(list.id);
    while (s.currentQuestion) {
      const q = await db.practiceQuestion.findUniqueOrThrow({
        where: { id: s.currentQuestion.id },
      });
      s = await submit(s, q.english === 'big' ? 'large' : 'big');
      s = (
        await call(s.id, 'next', { questionId: s.currentQuestion!.id, version: s.version })
      ).json<Reply>().session;
    }
    const done = await finishPractice(db, users[0]!, s.id);
    expect(done.session.correctCount).toBe(2);
    expect(done.session.masteryAppliedCount).toBe(0);
    for (const word of words) expect(await progress(word.id)).toBeNull();
  });
  it('identical spellings in separate lists retain independent mastery', async () => {
    const first = await fixture();
    const second = await fixture();
    const s = await submit(await start(first.list.id));
    await call(s.id, 'complete');
    expect((await progress(first.words[0]!.id))!.knownStreak).toBe(1);
    expect(await progress(second.words[0]!.id)).toBeNull();
  });
});

describe('targeted review uses the established flashcard engine', () => {
  it('keeps global snapshots after source-list deletion and applies both-direction learning to surviving entries', async () => {
    const first = await fixture([{ english: 'same', meanings: ['aynı'] }], users[1]);
    const second = await fixture([{ english: 'same', meanings: ['aynı'] }], users[1]);
    for (const f of [first, second])
      await db.wordProgress.create({ data: { wordId: f.words[0]!.id, needsReview: true } });
    let s = await startSession(db, users[1]!, null, {
      percentage: 100,
      direction: 'tr-en',
      reviewOnly: true,
    });
    await db.wordList.delete({ where: { id: first.list.id } });
    const resumed = (await b.inject(`/api/study-sessions/${s.id}`)).json<{ session: typeof s }>()
      .session;
    expect(resumed.cards).toHaveLength(2);
    expect(resumed.cards.find((c) => c.originListId === first.list.id)!.wordId).toBeNull();
    while (s.status === 'active') {
      s = (
        await actOnCard(db, users[1]!, s.id, {
          cardId: s.currentCard!.id,
          version: s.version,
          action: 'known',
        })
      ).session;
    }
    expect(await progress(first.words[0]!.id)).toBeNull();
    expect(await progress(second.words[0]!.id)).toEqual({ needsReview: true, knownStreak: 1 });
    const next = await startSession(db, users[1]!, null, {
      percentage: 100,
      direction: 'en-tr',
      reviewOnly: true,
    });
    expect(next.cards.map((c) => c.wordId)).toEqual([second.words[0]!.id]);
    await actOnCard(db, users[1]!, next.id, {
      cardId: next.currentCard!.id,
      version: next.version,
      action: 'known',
    });
    expect(await progress(second.words[0]!.id)).toEqual({ needsReview: false, knownStreak: 2 });
  });
  const options: { percentage: number; direction: string; listId: string | null } = {
    percentage: 100,
    direction: 'en-tr',
    listId: null,
  };
  const reviewStart = (payload = options, app = a) =>
    app.inject({ method: 'POST', url: '/api/review/study-sessions', payload });
  it('excludes cleared priority, scopes lists, and retains cross-list duplicate identities', async () => {
    // Isolate eligibility from prior fixtures without modifying their learning history.
    const first = await fixture([{ english: 'same', meanings: ['aynı'] }]);
    const second = await fixture([{ english: 'same', meanings: ['aynı'] }]);
    const cleared = await fixture();
    for (const f of [first, second])
      await db.wordProgress.create({ data: { wordId: f.words[0]!.id, needsReview: true } });
    await db.wordProgress.create({
      data: { wordId: cleared.words[0]!.id, needsReview: false, knownStreak: 2 },
    });
    const local = await startSession(db, users[0]!, first.list.id, {
      percentage: 100,
      direction: 'tr-en',
      reviewOnly: true,
    });
    expect(local.cards.map((c) => c.wordId)).toEqual([first.words[0]!.id]);
    const global = await startSession(db, users[0]!, null, {
      percentage: 100,
      direction: 'en-tr',
      reviewOnly: true,
    });
    expect(global.cards.some((c) => c.wordId === first.words[0]!.id)).toBe(true);
    expect(global.cards.some((c) => c.wordId === second.words[0]!.id)).toBe(true);
    expect(global.cards.some((c) => c.wordId === cleared.words[0]!.id)).toBe(false);
    expect(global.cards.find((c) => c.wordId === first.words[0]!.id)!.originListId).toBe(
      first.list.id,
    );
    expect(
      (await device.inject('/api/review/study-sessions/active')).json<Reply>().session.id,
    ).toBe(global.id);
    // Local, global and ordinary list sessions predictably coexist.
    expect(
      (await startSession(db, users[0]!, first.list.id, { percentage: 100, direction: 'en-tr' }))
        .id,
    ).toBeTruthy();
    const stored = await db.studySession.findUniqueOrThrow({ where: { id: global.id } });
    const { id: _id, ...data } = stored;
    await expect(db.studySession.create({ data })).rejects.toMatchObject({ code: 'P2002' });
    await a.inject({ method: 'POST', url: `/api/study-sessions/${global.id}/end`, payload: {} });
  });
  it('serializes concurrent ALL_LISTS creation and resumes the winning scope', async () => {
    const responses = await Promise.all([reviewStart(), reviewStart(options, device)]);
    expect(responses.map((r) => r.statusCode).sort()).toEqual([201, 409]);
    const s = responses.find((r) => r.statusCode === 201)!.json<Reply>().session;
    expect(
      (await device.inject('/api/review/study-sessions/active')).json<Reply>().session.id,
    ).toBe(s.id);
    const rows = await db.studySession.count({
      where: { ownerId: users[0]!, scopeKey: 'REVIEW:ALL_LISTS', status: 'ACTIVE' },
    });
    expect(rows).toBe(1);
    await a.inject({ method: 'POST', url: `/api/study-sessions/${s.id}/end`, payload: {} });
  });
  it('uses the eligible pool for percentage rounding with no unrelated fill', async () => {
    const f = await fixture(
      Array.from({ length: 20 }, (_, i) => ({ english: `eligible${i}`, meanings: [`anlam${i}`] })),
    );
    for (const word of f.words.slice(0, 7))
      await db.wordProgress.create({ data: { wordId: word.id, needsReview: true } });
    const s = await startSession(db, users[0]!, f.list.id, {
      percentage: 15,
      direction: 'en-tr',
      reviewOnly: true,
    });
    expect(s.cards).toHaveLength(2);
    expect(s.cards.every((c) => f.words.slice(0, 7).some((w) => w.id === c.wordId))).toBe(true);
    expect(
      (
        await a.inject({
          method: 'POST',
          url: '/api/review/study-sessions/eligibility',
          payload: { listId: f.list.id },
        })
      ).json<Reply>().count,
    ).toBe(7);
  });
  it('returns useful empty eligibility and rejects foreign scoped review', async () => {
    const f = await fixture();
    expect(
      (
        await a.inject({
          method: 'POST',
          url: '/api/review/study-sessions/eligibility',
          payload: { listId: f.list.id },
        })
      ).json<Reply>().count,
    ).toBe(0);
    expect((await reviewStart({ ...options, listId: f.list.id })).statusCode).toBe(409);
    expect(
      (
        await b.inject({
          method: 'POST',
          url: '/api/review/study-sessions/eligibility',
          payload: { listId: f.list.id },
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (await b.inject(`/api/review/study-sessions/active?listId=${f.list.id}`)).statusCode,
    ).toBe(404);
  });
  it('preserves both directions, skip/remove action order and the two-success rule', async () => {
    const f = await fixture();
    await flash(f.list.id, 'missed');
    let s = await startSession(db, users[0]!, f.list.id, {
      percentage: 100,
      direction: 'tr-en',
      reviewOnly: true,
    });
    expect(s.currentCard!.front).toEqual(['algoritma', 'işlem yolu']);
    expect(s.currentCard!.allowedActions).toEqual(['known', 'skip', 'missed']);
    s = (
      await actOnCard(db, users[0]!, s.id, {
        cardId: s.currentCard!.id,
        version: s.version,
        action: 'skip',
      })
    ).session;
    expect(s.currentCard!.allowedActions).toEqual(['known', 'remove', 'missed']);
    await actOnCard(db, users[0]!, s.id, {
      cardId: s.currentCard!.id,
      version: s.version,
      action: 'remove',
    });
    expect(await progress(f.words[0]!.id)).toEqual({ needsReview: true, knownStreak: 0 });
    await flash(f.list.id, 'known', true);
    await flash(f.list.id, 'known', true);
    expect(await progress(f.words[0]!.id)).toEqual({ needsReview: false, knownStreak: 2 });
  });
});
