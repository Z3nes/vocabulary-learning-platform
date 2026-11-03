import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { resolveUser } from '../src/auth/identity.js';
import { createDatabase } from '../src/db/client.js';
import type { PrismaClient } from '../src/generated/prisma/client.js';
import type { SessionView } from '../src/study/view.js';
import { startSession } from '../src/study/service.js';
import { loadLocalEnvironment, verifyTestDatabase } from './databaseSafety.js';
import { testConfig } from './helpers.js';

loadLocalEnvironment();
const targets = await verifyTestDatabase();
const db = createDatabase(targets.runtime);
const subjects = [`study-${randomUUID()}-A`, `study-${randomUUID()}-B`];
const identity = (index: number) => ({ provider: 'test', subject: subjects[index]! });
const users: string[] = [];
let a: FastifyInstance;
/** Second device of the same student. */
let a2: FastifyInstance;
let b: FastifyInstance;

type Session = SessionView;
type Direction = 'en-tr' | 'tr-en';
interface Word {
  id: string;
  english: string;
}

const app = (index: number) =>
  buildApp({
    config: testConfig({ databaseUrl: targets.runtime }),
    db,
    logger: false,
    identityProvider: { resolve: () => Promise.resolve(identity(index)) },
  });

async function newList(title = 'Study fixture', owner = a) {
  const response = await owner.inject({ method: 'POST', url: '/api/lists', payload: { title } });
  expect(response.statusCode).toBe(201);
  return response.json<{ list: { id: string } }>().list.id;
}
/** Adds `count` words through the real preview/commit flow; meanings are distinct per word. */
async function seed(listId: string, count: number, owner = a) {
  const text = Array.from(
    { length: count },
    (_, i) => `term${i}=anlam ${i};karşılık ${i};ifade ${i}`,
  ).join('\n');
  const url = `/api/lists/${listId}/words`;
  const submission = { kind: 'bulk', text };
  const preview = await owner.inject({
    method: 'POST',
    url: `${url}/preview`,
    payload: submission,
  });
  expect(preview.statusCode).toBe(200);
  const token = preview.json<{ token: string }>().token;
  const commit = await owner.inject({
    method: 'POST',
    url: `${url}/commit`,
    payload: { submission, token },
  });
  expect(commit.statusCode).toBe(200);
  const words = await owner.inject(url);
  return words.json<{ words: Word[] }>().words;
}
const start = (listId: string, percentage: number, direction: Direction = 'en-tr', owner = a) =>
  owner.inject({
    method: 'POST',
    url: `/api/lists/${listId}/study-sessions`,
    payload: { percentage, direction },
  });
async function started(listId: string, percentage: number, direction: Direction = 'en-tr') {
  const response = await start(listId, percentage, direction);
  expect(response.statusCode).toBe(201);
  return response.json<{ session: Session }>().session;
}
const act = (session: Pick<Session, 'id' | 'version'>, cardId: string, action: string, owner = a) =>
  owner.inject({
    method: 'POST',
    url: `/api/study-sessions/${session.id}/actions`,
    payload: { cardId, version: session.version, action },
  });
/** Acts on the current card and returns the new session state. */
async function next(session: Session, action: string, owner = a) {
  const response = await act(session, session.currentCard!.id, action, owner);
  expect(response.statusCode).toBe(200);
  const body = response.json<{ session: Session; applied: boolean }>();
  expect(body.applied).toBe(true);
  return body.session;
}
const end = (sessionId: string, owner = a) =>
  owner.inject({ method: 'POST', url: `/api/study-sessions/${sessionId}/end`, payload: {} });
const wordOf = (session: Session, cardId: string) =>
  session.cards.find((card) => card.id === cardId)!.wordId;
const progress = (wordId: string) =>
  db.wordProgress.findUnique({
    where: { wordId },
    select: { needsReview: true, knownStreak: true },
  });
const activeRows = (listId: string) =>
  db.studySession.count({ where: { wordListId: listId, status: 'ACTIVE' } });

beforeAll(async () => {
  // Fails before any fixture writes if the study migration has not been applied.
  await db.studySession.count();
  await db.wordProgress.count();
  for (const index of [0, 1]) users.push(await resolveUser(db, identity(index)));
  a = await app(0);
  a2 = await app(0);
  b = await app(1);
}, 20_000);

afterAll(async () => {
  await a?.close();
  await a2?.close();
  await b?.close();
  // Bounded cleanup: only this run's identities; lists, words and sessions cascade.
  const owned = await db.userIdentity.findMany({
    where: { provider: 'test', subject: { in: subjects } },
    select: { userId: true },
  });
  await db.user.deleteMany({ where: { id: { in: owned.map((row) => row.userId) } } });
  await db.$disconnect();
});

describe('study sessions against real PostgreSQL', () => {
  it('excludes lists created after the global review pool was locked', async () => {
    const original = await newList('Locked review fixture');
    const [word] = await seed(original, 1);
    await db.wordProgress.create({ data: { wordId: word!.id, needsReview: true, knownStreak: 0 } });
    let introduced: string | undefined;
    const gated = db.$extends({
      query: {
        word: {
          async findMany({ args, query }) {
            if (!introduced) {
              introduced = await newList('Concurrent review fixture');
              const [late] = await seed(introduced, 1);
              await db.wordProgress.create({
                data: { wordId: late!.id, needsReview: true, knownStreak: 0 },
              });
            }
            return query(args);
          },
        },
      },
    });
    const session = await startSession(gated as unknown as PrismaClient, users[0]!, null, {
      direction: 'en-tr',
      percentage: 100,
      reviewOnly: true,
    });
    expect(introduced).toBeDefined();
    expect(session.cards.some((card) => card.originListId === original)).toBe(true);
    expect(session.cards.some((card) => card.originListId === introduced)).toBe(false);
  });
  it('starts a persisted session with an immutable snapshot of distinct words', async () => {
    const listId = await newList('Algoritmalar');
    const words = await seed(listId, 7);
    const session = await started(listId, 15, 'en-tr');
    expect(session).toMatchObject({
      listId,
      listTitle: 'Algoritmalar',
      direction: 'en-tr',
      percentage: 15,
      status: 'active',
      version: 0,
      finishedAt: null,
      counts: { total: 2, known: 0, missed: 0, removed: 0, unanswered: 2 },
    });
    expect(session.cards).toHaveLength(2);
    expect(new Set(session.cards.map((card) => card.wordId)).size).toBe(2);
    for (const card of session.cards) {
      const index = Number(words.find((word) => word.id === card.wordId)!.english.slice(4));
      expect(card.english).toBe(`term${index}`);
      expect(card.meanings).toEqual([`anlam ${index}`, `karşılık ${index}`, `ifade ${index}`]);
    }
    expect(session.currentCard).toMatchObject({
      appearance: 1,
      allowedActions: ['known', 'skip', 'missed'],
    });
    expect(session.currentCard!.front).toEqual([session.cards[0]!.english]);
    expect(session.currentCard!.back).toEqual(session.cards[0]!.meanings);

    const stored = await db.studySession.findFirst({
      where: { id: session.id, ownerId: users[0]! },
      select: { cardCount: true, activeListId: true, _count: { select: { cards: true } } },
    });
    expect(stored).toEqual({ cardCount: 2, activeListId: listId, _count: { cards: 2 } });
    const active = await a.inject(`/api/lists/${listId}/study-sessions/active`);
    expect(active.statusCode).toBe(200);
    expect(active.headers['cache-control']).toBe('no-store');
    expect(active.json<{ session: Session }>().session).toEqual(session);
  });

  it.each([
    [10, 15, 2],
    [10, 25, 3],
    [10, 50, 5],
    [10, 100, 10],
  ])('%i words at %i%% start %i cards', async (count, percentage, cards) => {
    const listId = await newList();
    await seed(listId, count);
    expect((await started(listId, percentage)).cards).toHaveLength(cards);
  });

  it('refuses empty lists and never replaces an active session; other lists are independent', async () => {
    const empty = await newList('Boş');
    const refused = await start(empty, 100);
    expect(refused.statusCode).toBe(409);
    expect(refused.json()).toEqual({ error: { code: 'STUDY_LIST_EMPTY' } });
    expect(await db.studySession.count({ where: { wordListId: empty } })).toBe(0);
    expect(
      (await a.inject(`/api/lists/${empty}/study-sessions/active`)).json<{ session: null }>(),
    ).toEqual({ session: null });

    const listId = await newList();
    await seed(listId, 4);
    const first = await started(listId, 50);
    const second = await start(listId, 100, 'tr-en');
    expect(second.statusCode).toBe(409);
    expect(second.json()).toEqual({ error: { code: 'STUDY_SESSION_ACTIVE' } });
    expect(
      (await a.inject(`/api/study-sessions/${first.id}`)).json<{ session: Session }>().session,
    ).toEqual(first);

    const other = await newList('Diğer');
    await seed(other, 2);
    expect((await start(other, 100)).statusCode).toBe(201);
    expect(await activeRows(listId)).toBe(1);
    expect(await activeRows(other)).toBe(1);
  });

  it('lets exactly one of several concurrent start requests win', async () => {
    const listId = await newList();
    await seed(listId, 5);
    const responses = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        start(listId, 100, i % 2 ? 'tr-en' : 'en-tr', i % 2 ? a2 : a),
      ),
    );
    const codes = responses.map((response) => response.statusCode).sort();
    expect(codes).toEqual([201, 409, 409, 409, 409, 409]);
    for (const response of responses.filter((r) => r.statusCode === 409))
      expect(response.json()).toEqual({ error: { code: 'STUDY_SESSION_ACTIVE' } });
    expect(await db.studySession.count({ where: { wordListId: listId } })).toBe(1);
  });

  it('records Bildim/Bilemedim without reveal, sends Atla to the end once and Çıkar never deletes', async () => {
    const listId = await newList();
    await seed(listId, 3);
    let session = await started(listId, 100);
    const [first, second, third] = session.cards.map((card) => card.id) as [string, string, string];
    expect(session.currentCard!.id).toBe(first);

    session = await next(session, 'known');
    expect(session.currentCard!.id).toBe(second);
    session = await next(session, 'skip');
    expect(session.currentCard!.id).toBe(third);
    session = await next(session, 'missed');
    // The skipped card returns once, now with Çıkar instead of Atla.
    expect(session.currentCard).toMatchObject({
      id: second,
      appearance: 2,
      allowedActions: ['known', 'remove', 'missed'],
    });
    const skipAgain = await act(session, second, 'skip');
    expect(skipAgain.statusCode).toBe(409);
    expect(skipAgain.json()).toEqual({ error: { code: 'STUDY_ACTION_NOT_ALLOWED' } });
    session = await next(session, 'remove');

    expect(session.status).toBe('completed');
    expect(session.currentCard).toBeNull();
    expect(session.finishedAt).not.toBeNull();
    expect(session.counts).toEqual({ total: 3, known: 1, missed: 1, removed: 1, unanswered: 0 });
    expect(session.cards.map((card) => card.outcome)).toEqual(['known', 'removed', 'missed']);
    expect(session.cards.find((card) => card.id === second)!.skipped).toBe(true);

    const removedWord = wordOf(session, second)!;
    expect(await db.word.count({ where: { id: removedWord } })).toBe(1);
    expect(await progress(removedWord)).toBeNull();
    expect(await progress(wordOf(session, first)!)).toEqual({ needsReview: false, knownStreak: 1 });
    expect(await progress(wordOf(session, third)!)).toEqual({ needsReview: true, knownStreak: 0 });
    expect(await activeRows(listId)).toBe(0);
    // A completed session frees the list for a new one.
    expect((await start(listId, 100)).statusCode).toBe(201);
  });

  it('removing an already-prioritized word leaves its progress unchanged', async () => {
    const listId = await newList();
    const [word] = await seed(listId, 1);
    await next(await started(listId, 100), 'missed');
    expect(await progress(word!.id)).toEqual({ needsReview: true, knownStreak: 0 });
    let session = await started(listId, 100);
    session = await next(session, 'skip');
    session = await next(session, 'remove');
    expect(session.status).toBe('completed');
    expect(await progress(word!.id)).toEqual({ needsReview: true, knownStreak: 0 });
  });

  it('prioritizes missed words across sessions and shares progress across both directions', async () => {
    const listId = await newList();
    await seed(listId, 40);
    // Session 1 (EN→TR, 6 cards): miss the first card, then end early.
    let session = await started(listId, 15, 'en-tr');
    expect(session.cards).toHaveLength(6);
    const target = wordOf(session, session.currentCard!.id)!;
    session = await next(session, 'missed');
    expect((await end(session.id)).statusCode).toBe(200);
    expect(await progress(target)).toEqual({ needsReview: true, knownStreak: 0 });

    // Sessions 2 (TR→EN) and 3 (EN→TR): the prioritized word is always included.
    for (const [direction, expected] of [
      ['tr-en', { needsReview: true, knownStreak: 1 }],
      ['en-tr', { needsReview: false, knownStreak: 2 }],
    ] as const) {
      session = await started(listId, 15, direction);
      expect(session.cards.map((card) => card.wordId)).toContain(target);
      while (session.currentCard) {
        if (wordOf(session, session.currentCard.id) === target && direction === 'tr-en')
          expect(session.currentCard.front).toEqual(
            session.cards.find((card) => card.wordId === target)!.meanings,
          );
        session = await next(session, 'known');
      }
      expect(session.status).toBe('completed');
      expect(await progress(target)).toEqual(expected);
    }
  });

  it('a missed word between two Bildim answers keeps priority', async () => {
    const listId = await newList();
    const [word] = await seed(listId, 1);
    for (const action of ['missed', 'known', 'missed', 'known'] as const)
      await next(await started(listId, 100, 'tr-en'), action);
    expect(await progress(word!.id)).toEqual({ needsReview: true, knownStreak: 1 });
    await next(await started(listId, 100), 'known');
    expect(await progress(word!.id)).toEqual({ needsReview: false, knownStreak: 2 });
  });

  it('resumes on another device with the same order, version and snapshots after edits and deletes', async () => {
    const listId = await newList();
    const words = await seed(listId, 4);
    let session = await started(listId, 100, 'tr-en');
    session = await next(session, 'skip');
    session = await next(session, 'known');

    const resumed = await a2.inject(`/api/lists/${listId}/study-sessions/active`);
    expect(resumed.json<{ session: Session }>().session).toEqual(session);

    // Edit one unanswered word and delete another; the session keeps its snapshots.
    const remaining = session.cards.filter((card) => card.outcome === null);
    const edited = remaining[0]!;
    const deleted = remaining[1]!;
    const editResponse = await a.inject({
      method: 'PATCH',
      url: `/api/lists/${listId}/words/${edited.wordId!}`,
      payload: { english: 'changed', meanings: ['değişti'] },
    });
    expect(editResponse.statusCode).toBe(200);
    const deleteResponse = await a.inject({
      method: 'DELETE',
      url: `/api/lists/${listId}/words/${deleted.wordId!}`,
    });
    expect(deleteResponse.statusCode).toBe(204);
    expect(words.some((word) => word.id === deleted.wordId)).toBe(true);

    const after = (await a2.inject(`/api/study-sessions/${session.id}`)).json<{
      session: Session;
    }>().session;
    expect(after.version).toBe(session.version);
    expect(after.currentCard).toEqual(session.currentCard);
    expect(after.cards.find((card) => card.id === edited.id)).toMatchObject({
      english: edited.english,
      meanings: edited.meanings,
      wordId: edited.wordId,
    });
    expect(after.cards.find((card) => card.id === deleted.id)).toMatchObject({
      english: deleted.english,
      meanings: deleted.meanings,
      wordId: null,
    });

    // Finish from the second device, including the deleted word's card (no progress left).
    let state = after;
    while (state.currentCard)
      state = await next(state, state.currentCard.id === edited.id ? 'missed' : 'known', a2);
    expect(state.status).toBe('completed');
    expect(state.counts.unanswered).toBe(0);
    expect(await progress(edited.wordId!)).toEqual({ needsReview: true, knownStreak: 0 });
    expect(await db.wordProgress.count({ where: { wordId: deleted.wordId! } })).toBe(0);
  });

  it('ends early keeping recorded outcomes; ending is idempotent and final', async () => {
    const listId = await newList();
    await seed(listId, 5);
    let session = await started(listId, 100);
    session = await next(session, 'known');
    session = await next(session, 'missed');
    session = await next(session, 'skip');

    const ended = await end(session.id);
    expect(ended.statusCode).toBe(200);
    const body = ended.json<{ session: Session; applied: boolean }>();
    expect(body.applied).toBe(true);
    expect(body.session).toMatchObject({
      status: 'ended_early',
      currentCard: null,
      counts: { total: 5, known: 1, missed: 1, removed: 0, unanswered: 3 },
    });
    expect(body.session.finishedAt).not.toBeNull();
    const unanswered = body.session.cards.filter((card) => card.outcome === null);
    for (const card of unanswered) expect(await progress(card.wordId!)).toBeNull();

    const again = await end(session.id, a2);
    expect(again.json<{ applied: boolean; session: Session }>()).toEqual({
      applied: false,
      session: body.session,
    });
    const late = await act(body.session, unanswered[0]!.id, 'known');
    expect(late.statusCode).toBe(409);
    expect(late.json()).toEqual({ error: { code: 'STUDY_SESSION_FINISHED' } });
    expect(
      (await a.inject(`/api/lists/${listId}/study-sessions/active`)).json<{ session: null }>(),
    ).toEqual({ session: null });

    // A completed session cannot be ended early.
    const short = await newList();
    await seed(short, 1);
    const done = await next(await started(short, 100), 'known');
    const refused = await end(done.id);
    expect(refused.statusCode).toBe(409);
    expect(refused.json()).toEqual({ error: { code: 'STUDY_SESSION_FINISHED' } });

    const history = await a.inject(`/api/lists/${listId}/study-sessions`);
    expect(history.statusCode).toBe(200);
    const sessions = history.json<{ sessions: Record<string, unknown>[] }>().sessions;
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({ id: session.id, status: 'ended_early' });
    expect(sessions[0]).not.toHaveProperty('cards');
  });

  it('replays duplicate submissions and rejects conflicting or stale ones', async () => {
    const listId = await newList();
    await seed(listId, 3);
    const session = await started(listId, 100);
    const cardId = session.currentCard!.id;
    const wordId = wordOf(session, cardId)!;

    // Double click / retry: same action, same version.
    const [one, two] = await Promise.all([
      act(session, cardId, 'known'),
      act(session, cardId, 'known', a2),
    ]);
    const results = [one, two].map((response) =>
      response.json<{ applied: boolean; session: Session }>(),
    );
    expect([one.statusCode, two.statusCode]).toEqual([200, 200]);
    expect(results.map((result) => result.applied).sort()).toEqual([false, true]);
    expect(results.map((result) => result.session.version)).toEqual([1, 1]);
    expect(await progress(wordId)).toEqual({ needsReview: false, knownStreak: 1 });

    // A stale tab sending a different outcome for the answered card is never accepted.
    const conflict = await act(session, cardId, 'missed');
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json()).toEqual({ error: { code: 'STUDY_CARD_ALREADY_ANSWERED' } });
    // A stale tab acting on the next card with the old version is rejected.
    const current = results[0]!.session;
    const stale = await act(session, current.currentCard!.id, 'known');
    expect(stale.statusCode).toBe(409);
    expect(stale.json()).toEqual({ error: { code: 'STUDY_SESSION_STALE' } });
    // A card that is not current is rejected even with the right version.
    const later = current.cards.find(
      (card) => card.outcome === null && card.id !== current.currentCard!.id,
    )!;
    expect((await act(current, later.id, 'known')).json()).toEqual({
      error: { code: 'STUDY_SESSION_STALE' },
    });

    // Two devices answering the same card differently at the same time: one wins.
    const race = await Promise.all([
      act(current, current.currentCard!.id, 'known'),
      act(current, current.currentCard!.id, 'missed', a2),
    ]);
    expect(race.map((response) => response.statusCode).sort()).toEqual([200, 409]);
    expect(race.find((r) => r.statusCode === 409)!.json()).toEqual({
      error: { code: 'STUDY_CARD_ALREADY_ANSWERED' },
    });
    const stored = await db.studyCard.findFirst({
      where: { id: current.currentCard!.id },
      select: { outcome: true },
    });
    const winner = race.find((r) => r.statusCode === 200)!;
    expect(stored?.outcome).toBe(
      winner
        .json<{ session: Session }>()
        .session.cards.find((card) => card.id === current.currentCard!.id)!.outcome === 'known'
        ? 'KNOWN'
        : 'MISSED',
    );
    expect(
      (await db.studySession.findFirst({ where: { id: session.id }, select: { version: true } }))
        ?.version,
    ).toBe(2);

    // Duplicate skip retries do not move the card again.
    const afterRace = winner.json<{ session: Session }>().session;
    const skipped = afterRace.currentCard!.id;
    const firstSkip = await act(afterRace, skipped, 'skip');
    const retrySkip = await act(afterRace, skipped, 'skip');
    expect(firstSkip.json<{ applied: boolean }>().applied).toBe(true);
    expect(retrySkip.json<{ applied: boolean; session: Session }>()).toMatchObject({
      applied: false,
      session: { version: 3 },
    });
  });

  it('keeps every session private to its owner', async () => {
    const listId = await newList('Özel');
    await seed(listId, 2);
    const session = await started(listId, 100);
    const card = session.currentCard!.id;
    const missing = { error: { code: 'STUDY_SESSION_NOT_FOUND' } };
    const listMissing = { error: { code: 'LIST_NOT_FOUND' } };

    const probes = [
      [await b.inject(`/api/study-sessions/${session.id}`), 404, missing],
      [await act(session, card, 'missed', b), 404, missing],
      [await end(session.id, b), 404, missing],
      [await start(listId, 100, 'en-tr', b), 404, listMissing],
      [await b.inject(`/api/lists/${listId}/study-sessions/active`), 404, listMissing],
      [await b.inject(`/api/lists/${listId}/study-sessions`), 404, listMissing],
    ] as const;
    for (const [response, status, body] of probes) {
      expect(response.statusCode).toBe(status);
      expect(response.json()).toEqual(body);
    }
    expect(await db.studySession.count({ where: { ownerId: users[1]! } })).toBe(0);
    const unchanged = (await a.inject(`/api/study-sessions/${session.id}`)).json<{
      session: Session;
    }>().session;
    expect(unchanged).toEqual(session);
    expect(await progress(wordOf(session, card)!)).toBeNull();
  });

  it('validates input strictly', async () => {
    const listId = await newList();
    await seed(listId, 2);
    const invalidStarts = [
      { percentage: 30, direction: 'en-tr' },
      { percentage: '15', direction: 'en-tr' },
      { percentage: 15, direction: 'en' },
      { percentage: 15 },
      { percentage: 15, direction: 'en-tr', cardCount: 1 },
    ];
    for (const payload of invalidStarts) {
      const response = await a.inject({
        method: 'POST',
        url: `/api/lists/${listId}/study-sessions`,
        payload,
      });
      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ error: { code: 'VALIDATION_FAILED' } });
    }
    expect((await start('not-a-uuid', 15)).statusCode).toBe(400);
    expect(await db.studySession.count({ where: { wordListId: listId } })).toBe(0);

    const session = await started(listId, 100);
    const card = session.currentCard!.id;
    const invalidActions = [
      { cardId: card, version: 0, action: 'delete' },
      { cardId: card, version: -1, action: 'known' },
      { cardId: card, version: 0.5, action: 'known' },
      { cardId: 'x', version: 0, action: 'known' },
      { cardId: card, version: 0, action: 'known', outcome: 'known' },
      { cardId: card, action: 'known' },
    ];
    for (const payload of invalidActions) {
      const response = await a.inject({
        method: 'POST',
        url: `/api/study-sessions/${session.id}/actions`,
        payload,
      });
      expect(response.statusCode).toBe(400);
    }
    const unknownCard = await act(session, randomUUID(), 'known');
    expect(unknownCard.statusCode).toBe(404);
    expect(unknownCard.json()).toEqual({ error: { code: 'STUDY_CARD_NOT_FOUND' } });
    const unknownSession = await a.inject(`/api/study-sessions/${randomUUID()}`);
    expect(unknownSession.statusCode).toBe(404);
    expect((await a.inject('/api/study-sessions/nope')).statusCode).toBe(400);
    const extraEnd = await a.inject({
      method: 'POST',
      url: `/api/study-sessions/${session.id}/end`,
      payload: { force: true },
    });
    expect(extraEnd.statusCode).toBe(400);
    const plainText = await a.inject({
      method: 'POST',
      url: `/api/study-sessions/${session.id}/end`,
      headers: { 'content-type': 'text/plain' },
      payload: '{}',
    });
    expect(plainText.statusCode).toBe(415);
    const unchanged = (await a.inject(`/api/study-sessions/${session.id}`)).json<{
      session: Session;
    }>().session;
    expect(unchanged).toEqual(session);
  });

  it('rolls back the card outcome and version when the progress write fails', async () => {
    const listId = await newList();
    await seed(listId, 2);
    const session = await started(listId, 100);
    const cardId = session.currentCard!.id;
    const failing = db.$extends({
      query: {
        wordProgress: {
          async upsert({ args, query }) {
            await query(args);
            throw new Error('Injected progress failure');
          },
        },
      },
    });
    const broken = await buildApp({
      config: testConfig({ databaseUrl: targets.runtime }),
      db: failing as unknown as PrismaClient,
      logger: false,
      identityProvider: { resolve: () => Promise.resolve(identity(0)) },
    });
    try {
      const response = await act(session, cardId, 'missed', broken);
      expect(response.statusCode).toBe(500);
      expect(response.json()).toEqual({ error: { code: 'INTERNAL_ERROR' } });
    } finally {
      await broken.close();
    }
    const after = (await a.inject(`/api/study-sessions/${session.id}`)).json<{ session: Session }>()
      .session;
    expect(after).toEqual(session);
    expect(await progress(wordOf(session, cardId)!)).toBeNull();
    // The same request succeeds afterwards.
    expect((await next(session, 'missed')).version).toBe(1);
  });

  it('deleting a list removes its sessions; deleting a word keeps finished snapshots', async () => {
    const listId = await newList();
    const [word] = await seed(listId, 1);
    const done = await next(await started(listId, 100), 'known');
    expect(
      (await a.inject({ method: 'DELETE', url: `/api/lists/${listId}/words/${word!.id}` }))
        .statusCode,
    ).toBe(204);
    const kept = (await a.inject(`/api/study-sessions/${done.id}`)).json<{ session: Session }>()
      .session;
    expect(kept.cards[0]).toMatchObject({ wordId: null, english: 'term0', outcome: 'known' });

    expect((await a.inject({ method: 'DELETE', url: `/api/lists/${listId}` })).statusCode).toBe(
      204,
    );
    expect(await db.studySession.count({ where: { id: done.id } })).toBe(0);
    expect(await db.studyCard.count({ where: { sessionId: done.id } })).toBe(0);
  });
});
