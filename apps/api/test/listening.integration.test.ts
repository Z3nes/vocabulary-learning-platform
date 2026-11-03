import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { createDatabase } from '../src/db/client.js';
import { resolveUser } from '../src/auth/identity.js';
import { getPractice, finishPractice } from '../src/practice/service.js';
import { startSession, actOnCard } from '../src/study/service.js';
import { englishKey, meaningKey } from '../src/vocabulary/input.js';
import { SpeechService } from '../src/speech/service.js';
import { loadLocalEnvironment, verifyTestDatabase } from './databaseSafety.js';
import { testConfig } from './helpers.js';

loadLocalEnvironment();
const targets = await verifyTestDatabase();
const db = createDatabase(targets.runtime);
const identities = [0, 1].map(() => ({ provider: 'test', subject: `listening-${randomUUID()}` }));
const users: string[] = [],
  apps: FastifyInstance[] = [];
const synthesize = vi.fn<(s: string) => Promise<Buffer>>().mockResolvedValue(Buffer.from('audio'));
const speech = new SpeechService({ cacheKey: (s) => s, synthesize }, true);
let a: FastifyInstance, device: FastifyInstance, b: FastifyInstance;
type Session = Awaited<ReturnType<typeof getPractice>>;
interface Reply {
  session: Session;
  applied: boolean;
  activities: {
    kind: string;
    game: { completionId: string; gameType: string; items: { outcome: string }[] };
  }[];
}
beforeAll(async () => {
  await db.practiceQuestion.count({ where: { resolution: 'AUDIO_UNAVAILABLE' } });
  for (const identity of identities) users.push(await resolveUser(db, identity));
  for (const identity of [identities[0]!, identities[0]!, identities[1]!])
    apps.push(
      await buildApp({
        config: testConfig({ databaseUrl: targets.runtime }),
        db,
        speech,
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
) {
  const list = await db.wordList.create({
    data: { ownerId: users[0]!, title: 'Listening fixture' },
  });
  const words = entries.map((entry) => ({ ...entry, id: randomUUID() }));
  await db.word.createMany({
    data: words.map((w) => ({
      id: w.id,
      english: w.english,
      normalizedEnglishKey: englishKey(w.english),
      wordListId: list.id,
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
const startRequest = (listId: string, practiceType = 'listening', percentage = 100, app = a) =>
  app.inject({
    method: 'POST',
    url: `/api/lists/${listId}/practice`,
    payload: { practiceType, percentage },
  });
async function start(listId: string, practiceType = 'listening', percentage = 100) {
  const r = await startRequest(listId, practiceType, percentage);
  expect(r.statusCode).toBe(201);
  return r.json<Reply>().session;
}
const call = (s: Session, action: string, payload: object = {}, app = a) =>
  app.inject({ method: 'POST', url: `/api/practice/${s.id}/${action}`, payload });
const input = (s: Session) => ({ questionId: s.currentQuestion!.id, version: s.version });
async function answer(s: Session, answer = 'algorithm') {
  const r = await call(s, 'answers', { ...input(s), answer });
  expect(r.statusCode).toBe(200);
  return r.json<Reply>().session;
}
const progress = (wordId: string) =>
  db.wordProgress.findUnique({
    where: { wordId },
    select: { needsReview: true, knownStreak: true },
  });
async function flash(listId: string, action: 'known' | 'missed') {
  const s = await startSession(db, users[0]!, listId, { percentage: 100, direction: 'en-tr' });
  await actOnCard(db, users[0]!, s.id, { cardId: s.currentCard!.id, version: s.version, action });
}
const audio = (s: Session, app = a, payload: object = {}) =>
  app.inject({
    method: 'POST',
    url: `/api/practice/${s.id}/questions/${s.currentQuestion!.id}/audio`,
    payload,
  });

describe('Dinle ve Yaz reuses durable practice lifecycle', () => {
  it('protects simultaneous starts in the database and coexists with written recall and other lists', async () => {
    const f = await fixture(),
      g = await fixture();
    const responses = await Promise.all([
      startRequest(f.list.id),
      startRequest(f.list.id, 'listening', 100, device),
    ]);
    expect(responses.map((r) => r.statusCode).sort()).toEqual([201, 409]);
    const row = await db.practiceSession.findFirstOrThrow({
      where: { wordListId: f.list.id, practiceType: 'listening' },
    });
    const { id: _id, ...data } = row;
    await expect(db.practiceSession.create({ data })).rejects.toMatchObject({ code: 'P2002' });
    expect((await start(f.list.id, 'written-recall')).practiceType).toBe('written-recall');
    expect((await start(g.list.id)).practiceType).toBe('listening');
    expect(
      (
        await device.inject(`/api/lists/${f.list.id}/practice/active?practiceType=listening`)
      ).json<Reply>().session.id,
    ).toBe(row.id);
    expect(
      (await a.inject(`/api/lists/${f.list.id}/practice/active`)).json<Reply>().session
        .practiceType,
    ).toBe('written-recall');
  });
  it('persists hundreds of unique snapshots with approved rounding and stable cross-device order', async () => {
    const f = await fixture(
      Array.from({ length: 250 }, (_, i) => ({
        english: `term${i}`,
        meanings: [`anlam${i}`, `karşılık${i}`],
      })),
    );
    const s = await start(f.list.id, 'listening', 100);
    expect(s.questionCount).toBe(250);
    expect(s.eligibleCount).toBe(250);
    const questions = await db.practiceQuestion.findMany({
      where: { sessionId: s.id },
      orderBy: { position: 'asc' },
    });
    expect(new Set(questions.map((q) => q.sourceWordId)).size).toBe(250);
    expect((await device.inject(`/api/practice/${s.id}`)).json<Reply>().session).toEqual(s);
    await call(s, 'cancel');
    expect((await start(f.list.id, 'listening', 15)).questionCount).toBe(38);
  });
  it('shows all meanings while keeping spelling and acceptable responses out of unresolved state', async () => {
    const f = await fixture();
    const s = await start(f.list.id);
    expect(s.currentQuestion!.meanings).toEqual(['algoritma', 'işlem yolu']);
    expect(s.currentQuestion!.evaluation).toBeNull();
    expect(JSON.stringify(s)).not.toMatch(/algorithm|acceptedAnswers/);
  });
  it('rejects synonyms with identical complete meanings while preserving written-recall alternatives', async () => {
    const f = await fixture([
      { english: 'big', meanings: ['büyük'] },
      { english: 'large', meanings: ['büyük'] },
    ]);
    const s = await start(f.list.id, 'listening', 15);
    const q = await db.practiceQuestion.findUniqueOrThrow({ where: { id: s.currentQuestion!.id } });
    expect(q.acceptedAnswers).toEqual([q.english]);
    const alternative = q.english === 'big' ? 'large' : 'big';
    const evaluated = await answer(s, alternative);
    expect(evaluated.currentQuestion!.evaluation).toMatchObject({
      correct: false,
      masteryEligible: false,
      feedback: 'incorrect',
      english: q.english,
    });
    await call(s, 'complete');
    for (const w of f.words) expect(await progress(w.id)).toBeNull();
    const written = await start(f.list.id, 'written-recall', 15);
    const target = await db.practiceQuestion.findUniqueOrThrow({
      where: { id: written.currentQuestion!.id },
    });
    expect(
      (await answer(written, target.english === 'big' ? 'large' : 'big')).currentQuestion!
        .evaluation,
    ).toMatchObject({ correct: true, masteryEligible: false, feedback: 'alternative' });
  });
  it('normalizes case, spaces and apostrophes but preserves exact target punctuation', async () => {
    for (const [english, response, correct] of [
      ["don't", ' DON’T ', true],
      ['machine learning', ' Machine  learning ', true],
      ['C++', 'C', false],
    ] as const) {
      const f = await fixture([{ english, meanings: ['anlam'] }]);
      const s = await answer(await start(f.list.id), response);
      expect(s.currentQuestion!.evaluation).toMatchObject({ correct, masteryEligible: correct });
    }
  });
  it('persists one attempt across tabs, compatible retries and replacement rejection', async () => {
    const f = await fixture(),
      s = await start(f.list.id),
      payload = { ...input(s), answer: 'algorithm' };
    const responses = await Promise.all([
      call(s, 'answers', payload),
      call(s, 'answers', payload, device),
    ]);
    expect(responses.map((r) => r.json<Reply>().applied).sort()).toEqual([false, true]);
    expect((await call(s, 'answers', { ...payload, answer: 'algoritm' })).statusCode).toBe(409);
    const resumed = (await device.inject(`/api/practice/${s.id}`)).json<Reply>().session;
    expect(resumed.currentQuestion!.evaluation?.correct).toBe(true);
    expect(await progress(f.words[0]!.id)).toBeNull();
  });
  it('resolves an explicit audio skip durably, rejects stale versions and never evaluates it', async () => {
    const f = await fixture(),
      s = await start(f.list.id);
    expect((await call(s, 'skip-audio', { ...input(s), version: 99 })).statusCode).toBe(409);
    const r = await call(s, 'skip-audio', input(s));
    expect(r.statusCode).toBe(200);
    expect(r.json<Reply>().session.currentQuestion).toMatchObject({
      resolution: 'audio_unavailable',
      evaluation: null,
    });
    expect((await call(s, 'skip-audio', input(s), device)).json<Reply>().applied).toBe(false);
    expect((await call(s, 'answers', { ...input(s), answer: 'algorithm' })).statusCode).toBe(409);
    const q = await db.practiceQuestion.findUniqueOrThrow({ where: { id: s.currentQuestion!.id } });
    expect(q).toMatchObject({
      correct: null,
      answer: null,
      answeredAt: null,
      masteryEligible: false,
      masteryApplied: false,
    });
    expect(q.resolvedAt).not.toBeNull();
    const completed = await finishPractice(db, users[0]!, s.id);
    expect(completed.session).toMatchObject({
      correctCount: 0,
      incorrectCount: 0,
      skippedCount: 1,
      masteryAppliedCount: 0,
    });
    expect(await progress(f.words[0]!.id)).toBeNull();
    const history = await db.completedGame.findFirstOrThrow({ where: { completionId: s.id } });
    expect(history.gameType).toBe('listening');
    expect(history.items).toEqual([
      expect.objectContaining({
        outcome: 'audio_unavailable',
        attempts: 0,
        masteryEligible: false,
      }),
    ]);
    expect((await call(s, 'skip-audio', input(s))).statusCode).toBe(409);
  });
  it('requires current-question skips and advancement, never overwrites an evaluated answer', async () => {
    const f = await fixture([
      { english: 'one', meanings: ['bir'] },
      { english: 'two', meanings: ['iki'] },
    ]);
    let s = await start(f.list.id);
    const later = await db.practiceQuestion.findFirstOrThrow({
      where: { sessionId: s.id, position: 1 },
    });
    expect((await call(s, 'skip-audio', { ...input(s), questionId: later.id })).statusCode).toBe(
      409,
    );
    expect((await call(s, 'next', input(s))).statusCode).toBe(409);
    expect((await call(s, 'complete')).statusCode).toBe(409);
    s = await answer(s, 'wrong');
    expect((await call(s, 'skip-audio', input(s))).statusCode).toBe(409);
    const moved = await call(s, 'next', input(s));
    expect(moved.statusCode).toBe(200);
    s = moved.json<Reply>().session;
    const skipped = await call(s, 'skip-audio', input(s));
    s = skipped.json<Reply>().session;
    expect((await call(s, 'complete')).statusCode).toBe(200);
  });
  it('does not permit audio skipping in Yazılı Cevap', async () => {
    const f = await fixture(),
      s = await start(f.list.id, 'written-recall');
    expect((await call(s, 'skip-audio', input(s))).statusCode).toBe(409);
  });
  it('allows cancellation without any credit/history and rejects completion afterward', async () => {
    const f = await fixture(),
      s = await answer(await start(f.list.id));
    await call(s, 'cancel');
    expect((await call(s, 'complete')).statusCode).toBe(409);
    expect(await progress(f.words[0]!.id)).toBeNull();
    expect(await db.completedGame.count({ where: { completionId: s.id } })).toBe(0);
    expect((await start(f.list.id)).status).toBe('ACTIVE');
  });
  it('applies no credit for an incomplete session with a saved exact answer', async () => {
    const f = await fixture([
      { english: 'one', meanings: ['bir'] },
      { english: 'two', meanings: ['iki'] },
    ]);
    const s = await start(f.list.id);
    const q = await db.practiceQuestion.findUniqueOrThrow({ where: { id: s.currentQuestion!.id } });
    await answer(s, q.english);
    expect((await call(s, 'complete')).statusCode).toBe(409);
    for (const w of f.words) expect(await progress(w.id)).toBeNull();
  });
  it('completes atomically and idempotently with one history record and positive credit', async () => {
    const f = await fixture(),
      s = await answer(await start(f.list.id));
    expect(await progress(f.words[0]!.id)).toBeNull();
    const responses = await Promise.all([call(s, 'complete'), call(s, 'complete', {}, device)]);
    expect(responses.map((r) => r.json<Reply>().applied).sort()).toEqual([false, true]);
    expect(await progress(f.words[0]!.id)).toEqual({ needsReview: false, knownStreak: 1 });
    expect((await call(s, 'complete')).json<Reply>().applied).toBe(false);
    expect(await db.completedGame.count({ where: { completionId: s.id } })).toBe(1);
    expect(
      (await a.inject('/api/activity'))
        .json<Reply>()
        .activities.some((r) => r.kind === 'game' && r.game.gameType === 'listening'),
    ).toBe(true);
  });
  it('uses the same locks for simultaneous cancellation/completion with no partial evidence', async () => {
    const f = await fixture(),
      s = await answer(await start(f.list.id));
    const responses = await Promise.all([call(s, 'complete'), call(s, 'cancel', {}, device)]);
    expect(responses.map((r) => r.statusCode).sort()).toEqual([200, 409]);
    const done = await getPractice(db, users[0]!, s.id);
    expect(await db.completedGame.count({ where: { completionId: s.id } })).toBe(
      done.status === 'COMPLETED' ? 1 : 0,
    );
    expect((await progress(f.words[0]!.id))?.knownStreak ?? 0).toBe(
      done.status === 'COMPLETED' ? 1 : 0,
    );
  });
  it('keeps speech and every lifecycle operation behind real session ownership', async () => {
    const f = await fixture(),
      s = await start(f.list.id);
    const before = synthesize.mock.calls.length;
    expect((await audio(s, b)).statusCode).toBe(404);
    expect(synthesize.mock.calls).toHaveLength(before);
    expect((await b.inject(`/api/practice/${s.id}`)).statusCode).toBe(404);
    for (const [action, payload] of [
      ['skip-audio', input(s)],
      ['answers', { ...input(s), answer: 'algorithm' }],
      ['next', input(s)],
      ['cancel', {}],
      ['complete', {}],
    ] as const)
      expect((await call(s, action, payload, b)).statusCode).toBe(404);
    expect((await startRequest(f.list.id, 'listening', 100, b)).statusCode).toBe(404);
  });
  it('synthesizes immutable snapshot text after source edits/deletion and rejects resolved/stale playback', async () => {
    const f = await fixture([{ english: 'recursion', meanings: ['özyineleme'] }]),
      s = await start(f.list.id);
    await db.word.update({ where: { id: f.words[0]!.id }, data: { english: 'edited' } });
    await db.word.delete({ where: { id: f.words[0]!.id } });
    expect((await audio(s)).statusCode).toBe(200);
    expect(synthesize).toHaveBeenCalledWith('recursion');
    const evaluated = await answer(s, 'recursion');
    expect((await audio(evaluated)).statusCode).toBe(409);
    const done = await finishPractice(db, users[0]!, s.id);
    expect(done.session.masteryAppliedCount).toBe(0);
  });
  it('database constraints distinguish unresolved, evaluated and unavailable states without NULL bypasses', async () => {
    const f = await fixture(),
      s = await start(f.list.id),
      id = s.currentQuestion!.id;
    for (const data of [
      { resolvedAt: new Date() },
      { resolution: 'ANSWERED' as const, resolvedAt: new Date() },
      { resolution: 'AUDIO_UNAVAILABLE' as const, resolvedAt: new Date(), masteryEligible: true },
    ])
      await expect(db.practiceQuestion.update({ where: { id }, data })).rejects.toBeDefined();
    expect((await getPractice(db, users[0]!, s.id)).currentQuestion!.resolution).toBeNull();
  });
});

describe('listening shares the asymmetric mastery transition', () => {
  it('two completed listening sessions clear review; intervening wrong answers and skips are ignored', async () => {
    const f = await fixture();
    await flash(f.list.id, 'missed');
    const first = await answer(await start(f.list.id));
    await call(first, 'complete');
    expect(await progress(f.words[0]!.id)).toEqual({ needsReview: true, knownStreak: 1 });
    const wrong = await answer(await start(f.list.id), 'algoritm');
    await call(wrong, 'complete');
    const skipped = await start(f.list.id);
    await call(skipped, 'skip-audio', input(skipped));
    await call(skipped, 'complete');
    expect(await progress(f.words[0]!.id)).toEqual({ needsReview: true, knownStreak: 1 });
    const second = await answer(await start(f.list.id));
    await call(second, 'complete');
    expect(await progress(f.words[0]!.id)).toEqual({ needsReview: false, knownStreak: 2 });
  });
  it('wrong answers never activate review, and duplicate spellings in other lists receive no credit', async () => {
    const f = await fixture(),
      g = await fixture();
    const wrong = await answer(await start(f.list.id), 'wrong');
    await call(wrong, 'complete');
    expect(await progress(f.words[0]!.id)).toBeNull();
    const right = await answer(await start(f.list.id));
    await call(right, 'complete');
    expect((await progress(f.words[0]!.id))!.knownStreak).toBe(1);
    expect(await progress(g.words[0]!.id)).toBeNull();
  });
  it('an earlier-started listening game contributes after later flashcard events when completed', async () => {
    const f = await fixture(),
      s = await answer(await start(f.list.id));
    await flash(f.list.id, 'known');
    await flash(f.list.id, 'missed');
    await call(s, 'complete');
    expect(await progress(f.words[0]!.id)).toEqual({ needsReview: true, knownStreak: 1 });
  });
  it('concurrent flashcard and listening successes serialize without losing progress', async () => {
    const f = await fixture();
    await flash(f.list.id, 'missed');
    const s = await answer(await start(f.list.id));
    const card = await startSession(db, users[0]!, f.list.id, {
      percentage: 100,
      direction: 'tr-en',
    });
    await Promise.all([
      finishPractice(db, users[0]!, s.id),
      actOnCard(db, users[0]!, card.id, {
        cardId: card.currentCard!.id,
        version: card.version,
        action: 'known',
      }),
    ]);
    expect(await progress(f.words[0]!.id)).toEqual({ needsReview: false, knownStreak: 2 });
  });
});
