import { Prisma, type PrismaClient } from '../generated/prisma/client.js';
import { ApplicationError } from '../http/errors.js';
import { lockList } from '../vocabulary/service.js';
import { applyEvaluation, initialProgress } from './progress.js';
import { planAction, planEnd, type StudyAction } from './queue.js';
import {
  selectSessionWords,
  secureRandomInt,
  type RandomInt,
  type StudyPercentage,
} from './selection.js';
import {
  cardSelection,
  directionFromApi,
  sessionSelection,
  sessionSummaryView,
  sessionView,
} from './view.js';

type Transaction = Prisma.TransactionClient;

/**
 * Lock order for every study write, shared with vocabulary writes:
 *   WordList row  ->  StudySession row  ->  StudyCard / WordProgress rows.
 * Taking the owned list lock first serializes session creation, card actions, word
 * edits/deletions and list deletion for one list, so they can neither interleave nor
 * deadlock. All ownership checks are part of the locking queries.
 */
async function transaction<T>(db: PrismaClient, operation: (tx: Transaction) => Promise<T>) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await db.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        maxWait: 10_000,
        timeout: 20_000,
      });
    } catch (error) {
      // P2034: write conflict or deadlock reported by PostgreSQL; safe to retry whole.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2034' &&
        attempt < 2
      )
        continue;
      throw error;
    }
  }
}

async function readView(tx: Transaction, sessionId: string, ownerId: string) {
  const session = await tx.studySession.findFirst({
    where: { id: sessionId, ownerId },
    select: { ...sessionSelection, cards: { select: cardSelection } },
  });
  if (!session) throw new ApplicationError(404, 'STUDY_SESSION_NOT_FOUND');
  const { cards, ...rest } = session;
  return sessionView(rest, cards);
}

/** Locks the owned list, then the owned session; foreign or missing sessions are 404. */
async function lockSession(tx: Transaction, sessionId: string, ownerId: string) {
  const owned = await tx.studySession.findFirst({
    where: { id: sessionId, ownerId },
    select: { wordListId: true },
  });
  if (!owned) throw new ApplicationError(404, 'STUDY_SESSION_NOT_FOUND');
  if (owned.wordListId) await lockList(tx, owned.wordListId, ownerId);
  else await lockOwnedLists(tx, ownerId);
  const rows = await tx.$queryRaw<
    { status: 'ACTIVE' | 'COMPLETED' | 'ENDED_EARLY'; version: number }[]
  >`
    SELECT "status", "version" FROM "StudySession"
    WHERE "id" = ${sessionId}::uuid AND "ownerId" = ${ownerId}::uuid FOR UPDATE`;
  const session = rows[0];
  if (!session) throw new ApplicationError(404, 'STUDY_SESSION_NOT_FOUND');
  return session;
}

async function ownedList(db: PrismaClient | Transaction, listId: string, ownerId: string) {
  const list = await db.wordList.findFirst({
    where: { id: listId, ownerId },
    select: { id: true, title: true },
  });
  if (!list) throw new ApplicationError(404, 'LIST_NOT_FOUND');
  return list;
}

export interface StartOptions {
  percentage: StudyPercentage;
  direction: keyof typeof directionFromApi;
  reviewOnly?: boolean;
}

/**
 * Starts a session over a snapshot of the list's current words. Fails with
 * STUDY_SESSION_ACTIVE while another session of this list is active (never replaces it)
 * and with STUDY_LIST_EMPTY for a list without words.
 */
export async function startSession(
  db: PrismaClient,
  ownerId: string,
  listId: string | null,
  options: StartOptions,
  random: RandomInt = secureRandomInt,
) {
  try {
    return await transaction(db, async (tx) => {
      const lockedIds = listId
        ? (await lockList(tx, listId, ownerId), [listId])
        : await lockOwnedLists(tx, ownerId);
      const list = listId ? await ownedList(tx, listId, ownerId) : { title: 'Tüm listelerin' };
      const scopeKey = studyScope(listId, options.reviewOnly === true);
      const active = await tx.studySession.findFirst({
        where: { scopeKey, ownerId, status: 'ACTIVE' },
        select: { id: true },
      });
      if (active) throw new ApplicationError(409, 'STUDY_SESSION_ACTIVE');

      const candidates = await tx.word.findMany({
        where: {
          wordListId: { in: lockedIds },
          wordList: { ownerId },
          ...(options.reviewOnly ? { progress: { needsReview: true } } : {}),
        },
        select: { id: true, progress: { select: { needsReview: true } } },
      });
      if (!candidates.length) throw new ApplicationError(409, 'STUDY_LIST_EMPTY');
      const ids = selectSessionWords(
        candidates.map((word) => ({
          id: word.id,
          needsReview: word.progress?.needsReview ?? false,
        })),
        options.percentage,
        random,
      );
      const words = new Map(
        (
          await tx.word.findMany({
            where: {
              id: { in: ids },
              wordListId: { in: lockedIds },
              wordList: { ownerId },
            },
            select: {
              id: true,
              english: true,
              wordListId: true,
              wordList: { select: { title: true } },
              meanings: { select: { turkish: true }, orderBy: { position: 'asc' } },
            },
          })
        ).map((word) => [word.id, word]),
      );
      const session = await tx.studySession.create({
        data: {
          ownerId,
          wordListId: listId,
          activeListId: options.reviewOnly ? null : listId,
          scopeKey,
          reviewOnly: options.reviewOnly === true,
          eligibleCount: candidates.length,
          listTitle: list.title,
          direction: directionFromApi[options.direction],
          percentage: options.percentage,
          cardCount: ids.length,
          cards: {
            createMany: {
              data: ids.map((id, position) => {
                const word = words.get(id)!;
                return {
                  wordId: id,
                  originListId: word.wordListId,
                  originListTitle: word.wordList.title,
                  english: word.english,
                  meanings: word.meanings.map((meaning) => meaning.turkish),
                  position,
                  queueOrder: position,
                };
              }),
            },
          },
        },
        select: { id: true },
      });
      return readView(tx, session.id, ownerId);
    });
  } catch (error) {
    // Backstop for the unique active-session index (the list lock normally prevents it).
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
      throw new ApplicationError(409, 'STUDY_SESSION_ACTIVE');
    throw error;
  }
}

export interface ActionInput {
  cardId: string;
  /** The session version the client last saw. */
  version: number;
  action: StudyAction;
}

/**
 * Applies one card action atomically: the card outcome or skip, the shared word
 * progress (KNOWN/MISSED only), the session version and, after the last card, the
 * completion. `applied: false` means an identical earlier action was replayed.
 */
export async function actOnCard(
  db: PrismaClient,
  ownerId: string,
  sessionId: string,
  input: ActionInput,
) {
  return transaction(db, async (tx) => {
    const session = await lockSession(tx, sessionId, ownerId);
    const cards = await tx.studyCard.findMany({
      where: { sessionId },
      select: { id: true, queueOrder: true, skipped: true, outcome: true, wordId: true },
    });
    const plan = planAction({
      status: session.status,
      version: session.version,
      expectedVersion: input.version,
      cards,
      cardId: input.cardId,
      action: input.action,
    });
    if (plan.type === 'replay')
      return { session: await readView(tx, sessionId, ownerId), applied: false };

    const now = new Date();
    if (plan.type === 'skip') {
      await tx.studyCard.update({
        where: { id: input.cardId, sessionId },
        data: { skipped: true, queueOrder: plan.queueOrder },
      });
    } else {
      await tx.studyCard.update({
        where: { id: input.cardId, sessionId },
        data: { outcome: plan.outcome, answeredAt: now },
      });
      const wordId = cards.find((card) => card.id === input.cardId)!.wordId;
      // A deleted word keeps its snapshot but has no progress left to update.
      if (wordId && plan.outcome !== 'REMOVED') {
        const previous = await tx.wordProgress.findUnique({
          where: { wordId },
          select: { needsReview: true, knownStreak: true },
        });
        const next = applyEvaluation(
          previous ?? initialProgress,
          plan.outcome === 'KNOWN' ? 'known' : 'missed',
        );
        await tx.wordProgress.upsert({
          where: { wordId },
          create: { wordId, ...next },
          update: next,
        });
      }
    }
    const completes = plan.type === 'resolve' && plan.completesSession;
    await tx.studySession.update({
      where: { id: sessionId, ownerId },
      data: {
        version: { increment: 1 },
        ...(completes ? { status: 'COMPLETED', finishedAt: now, activeListId: null } : {}),
      },
    });
    return { session: await readView(tx, sessionId, ownerId), applied: true };
  });
}

/**
 * Ends an active session early. Recorded outcomes are kept; unanswered and skipped
 * cards stay unresolved and count as neither known nor missed. Idempotent.
 */
export async function endSession(db: PrismaClient, ownerId: string, sessionId: string) {
  return transaction(db, async (tx) => {
    const session = await lockSession(tx, sessionId, ownerId);
    if (planEnd(session.status) === 'replay')
      return { session: await readView(tx, sessionId, ownerId), applied: false };
    await tx.studySession.update({
      where: { id: sessionId, ownerId },
      data: {
        status: 'ENDED_EARLY',
        finishedAt: new Date(),
        activeListId: null,
        version: { increment: 1 },
      },
    });
    return { session: await readView(tx, sessionId, ownerId), applied: true };
  });
}

export async function getSession(db: PrismaClient, ownerId: string, sessionId: string) {
  return transaction(db, (tx) => readView(tx, sessionId, ownerId));
}

/** The list's active session, or null. Unknown and foreign lists are LIST_NOT_FOUND. */
export async function getActiveSession(
  db: PrismaClient,
  ownerId: string,
  listId: string | null,
  reviewOnly = false,
) {
  if (listId) await ownedList(db, listId, ownerId);
  const active = await db.studySession.findFirst({
    where: { scopeKey: studyScope(listId, reviewOnly), ownerId, status: 'ACTIVE' },
    select: { id: true },
  });
  return active ? getSession(db, ownerId, active.id) : null;
}

export const studyScope = (listId: string | null, reviewOnly: boolean) =>
  `${reviewOnly ? 'REVIEW:' : ''}${listId ? `LIST:${listId}` : 'ALL_LISTS'}`;

/** Cross-list writes share the existing per-list event serialization. */
async function lockOwnedLists(tx: Transaction, ownerId: string) {
  const rows = await tx.$queryRaw<
    { id: string }[]
  >`SELECT "id" FROM "WordList" WHERE "ownerId" = ${ownerId}::uuid ORDER BY "id" FOR UPDATE`;
  return rows.map((row) => row.id);
}

/** Most recent sessions of a list, newest first, without card snapshots. */
export async function listSessions(db: PrismaClient, ownerId: string, listId: string) {
  await ownedList(db, listId, ownerId);
  const sessions = await db.studySession.findMany({
    where: { wordListId: listId, ownerId },
    select: { ...sessionSelection, cards: { select: { outcome: true } } },
    orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
    take: 50,
  });
  return sessions.map(({ cards, ...session }) => sessionSummaryView(session, cards));
}
