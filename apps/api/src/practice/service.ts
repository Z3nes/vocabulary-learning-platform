import type { Prisma, PrismaClient } from '../generated/prisma/client.js';
import { ApplicationError } from '../http/errors.js';
import { lockList } from '../vocabulary/service.js';
import { englishKey } from '../vocabulary/input.js';
import { applyEvaluation, initialProgress } from '../study/progress.js';
import { sessionCardCount, shuffle, type StudyPercentage } from '../study/selection.js';
import { createAnswerSnapshotter, evaluateAnswer } from './evaluation.js';
import type { PracticeType } from './types.js';
import { choiceDataSchema, mixedActivities } from './mixedPlan.js';

type Tx = Prisma.TransactionClient;
const missing = () => new ApplicationError(404, 'PRACTICE_SESSION_NOT_FOUND');
const conflict = () => new ApplicationError(409, 'PRACTICE_CONFLICT');
const include = { questions: { orderBy: { position: 'asc' as const } } };

async function view(tx: Tx | PrismaClient, ownerId: string, id: string) {
  const session = await tx.practiceSession.findFirst({ where: { id, ownerId }, include });
  if (!session) throw missing();
  const question = session.questions[session.currentPosition];
  const questionView = (q: typeof question) =>
    q
      ? {
          id: q.id,
          position: q.position,
          meanings:
            (q.activityType === 'flashcard' && !q.revealedAt) ||
            (q.activityType === 'choice' && !q.resolution)
              ? []
              : q.meanings,
          ...(q.activityType
            ? {
                activityType: q.activityType,
                originListId: q.originListId,
                originListTitle: q.originListTitle,
                revealed: q.revealedAt !== null,
                ...(['flashcard', 'choice'].includes(q.activityType) ? { prompt: q.english } : {}),
                ...(q.activityType === 'choice'
                  ? {
                      options: choiceDataSchema.parse(q.modeData).options,
                      ...(q.resolution
                        ? { correctOptionId: choiceDataSchema.parse(q.modeData).correctOptionId }
                        : {}),
                    }
                  : {}),
              }
            : {}),
          resolution:
            q.resolution === 'ANSWERED'
              ? ('answered' as const)
              : q.resolution === 'AUDIO_UNAVAILABLE'
                ? ('audio_unavailable' as const)
                : null,
          evaluation:
            q.answer === null
              ? null
              : {
                  answer: q.answer,
                  english: q.english,
                  correct: q.correct,
                  masteryEligible: q.masteryEligible,
                  masteryApplied: q.masteryApplied,
                  // Render the persisted evaluation; never re-evaluate a saved attempt.
                  feedback:
                    q.activityType === 'flashcard'
                      ? ('self' as const)
                      : q.activityType === 'choice'
                        ? ('choice' as const)
                        : q.masteryEligible
                          ? ('target' as const)
                          : q.correct
                            ? ('alternative' as const)
                            : q.overlappingAnswers.includes(q.normalizedAnswer!)
                              ? ('overlap' as const)
                              : ('incorrect' as const),
                },
        }
      : null;
  return {
    id: session.id,
    listId: session.wordListId,
    listTitle: session.listTitle,
    practiceType: session.practiceType,
    percentage: session.percentage,
    eligibleCount: session.eligibleCount,
    questionCount: session.questionCount,
    currentPosition: session.currentPosition,
    version: session.version,
    status: session.status,
    createdAt: session.createdAt,
    completedAt: session.completedAt,
    canceledAt: session.canceledAt,
    currentQuestion: session.status === 'ACTIVE' ? questionView(question) : null,
    results: session.status === 'COMPLETED' ? session.questions.map(questionView) : [],
    correctCount: session.questions.filter((q) => q.correct).length,
    incorrectCount: session.questions.filter((q) => q.correct === false).length,
    skippedCount: session.questions.filter((q) => q.resolution === 'AUDIO_UNAVAILABLE').length,
    masteryEligibleCount: session.questions.filter((q) => q.masteryEligible).length,
    masteryAppliedCount: session.questions.filter((q) => q.masteryApplied).length,
    ...(session.practiceType === 'mixed'
      ? {
          selfKnownCount: session.questions.filter(
            (q) => q.activityType === 'flashcard' && q.answer === 'known',
          ).length,
          selfMissedCount: session.questions.filter(
            (q) => q.activityType === 'flashcard' && q.answer === 'missed',
          ).length,
          distribution: mixedActivities.map((activityType) => ({
            activityType,
            total: session.questions.filter((q) => q.activityType === activityType).length,
            correct: session.questions.filter(
              (q) => q.activityType === activityType && q.correct === true,
            ).length,
            incorrect: session.questions.filter(
              (q) => q.activityType === activityType && q.correct === false,
            ).length,
            skipped: session.questions.filter(
              (q) => q.activityType === activityType && q.resolution === 'AUDIO_UNAVAILABLE',
            ).length,
          })),
        }
      : {}),
  };
}

/** List -> session lock order matches vocabulary and flashcard writes. */
async function locked(tx: Tx, ownerId: string, id: string) {
  const owned = await tx.practiceSession.findFirst({ where: { id, ownerId } });
  if (!owned) throw missing();
  if (owned.wordListId) {
    // A concurrent list deletion may remove this row. The session FK becomes NULL;
    // re-read under the session lock and retain its immutable snapshots.
    await tx.$queryRaw`SELECT "id" FROM "WordList" WHERE "id" = ${owned.wordListId}::uuid AND "ownerId" = ${ownerId}::uuid FOR UPDATE`;
  } else if (owned.practiceType === 'mixed' && owned.scopeKey === 'ALL_LISTS')
    await lockPracticeLists(tx, ownerId);
  await tx.$queryRaw`SELECT "id" FROM "PracticeSession" WHERE "id" = ${id}::uuid AND "ownerId" = ${ownerId}::uuid FOR UPDATE`;
  const session = await tx.practiceSession.findFirst({ where: { id, ownerId }, include });
  if (!session) throw missing();
  return session;
}
export const lockPractice = locked;
/** Return exactly the list IDs locked in UUID order, excluding concurrently created lists. */
export async function lockPracticeLists(tx: Tx, ownerId: string) {
  const rows = await tx.$queryRaw<
    { id: string }[]
  >`SELECT "id" FROM "WordList" WHERE "ownerId" = ${ownerId}::uuid ORDER BY "id" FOR UPDATE`;
  return rows.map((row) => row.id);
}
export const practiceTransaction = <T>(db: PrismaClient, op: (tx: Tx) => Promise<T>) =>
  db.$transaction(op, { maxWait: 10000, timeout: 20000 });

export async function activePractice(
  db: PrismaClient,
  ownerId: string,
  listId: string,
  practiceType: PracticeType = 'written-recall',
) {
  if (!(await db.wordList.findFirst({ where: { id: listId, ownerId } })))
    throw new ApplicationError(404, 'LIST_NOT_FOUND');
  const active = await db.practiceSession.findFirst({
    where: {
      ownerId,
      scopeKey: `LIST:${listId}`,
      practiceType,
      status: 'ACTIVE',
    },
  });
  return active ? view(db, ownerId, active.id) : null;
}
export const getPractice = view;

export async function startPractice(
  db: PrismaClient,
  ownerId: string,
  listId: string,
  percentage: StudyPercentage,
  practiceType: PracticeType = 'written-recall',
) {
  return practiceTransaction(db, async (tx) => {
    await lockList(tx, listId, ownerId);
    if (
      await tx.practiceSession.findFirst({
        where: {
          ownerId,
          scopeKey: `LIST:${listId}`,
          practiceType,
          status: 'ACTIVE',
        },
      })
    )
      throw new ApplicationError(409, 'PRACTICE_SESSION_ACTIVE');
    const list = await tx.wordList.findFirstOrThrow({ where: { id: listId, ownerId } });
    const stored = await tx.word.findMany({
      where: { wordListId: listId, wordList: { ownerId } },
      include: { meanings: { orderBy: { position: 'asc' } } },
    });
    const words = stored.map((w) => ({
      id: w.id,
      english: w.english,
      meanings: w.meanings.map((m) => m.turkish),
    }));
    if (!words.length) throw new ApplicationError(409, 'STUDY_LIST_EMPTY');
    const selected = shuffle(words).slice(0, sessionCardCount(words.length, percentage));
    const snapshotAnswers = createAnswerSnapshotter(words);
    const session = await tx.practiceSession.create({
      data: {
        ownerId,
        wordListId: listId,
        scopeKey: `LIST:${listId}`,
        listTitle: list.title,
        practiceType,
        percentage,
        eligibleCount: words.length,
        questionCount: selected.length,
        questions: {
          createMany: {
            data: selected.map((w, position) => ({
              wordId: w.id,
              sourceWordId: w.id,
              position,
              english: w.english,
              meanings: w.meanings,
              ...(practiceType === 'listening'
                ? { acceptedAnswers: [englishKey(w.english)], overlappingAnswers: [] }
                : snapshotAnswers(w)),
            })),
          },
        },
      },
    });
    return view(tx, ownerId, session.id);
  });
}

export async function submitPractice(
  db: PrismaClient,
  ownerId: string,
  id: string,
  input: { questionId: string; version: number; answer: string },
) {
  return practiceTransaction(db, async (tx) => {
    const session = await locked(tx, ownerId, id);
    if (session.status !== 'ACTIVE') throw conflict();
    const question = session.questions.find((q) => q.id === input.questionId);
    if (!question) throw conflict();
    if (
      session.practiceType === 'mixed' &&
      !['written-recall', 'listening'].includes(question.activityType ?? '')
    )
      throw conflict();
    if (question.resolution === 'AUDIO_UNAVAILABLE') throw conflict();
    if (question.answer !== null) {
      if (question.normalizedAnswer !== englishKey(input.answer)) throw conflict();
      return { session: await view(tx, ownerId, id), applied: false };
    }
    if (session.version !== input.version || question.position !== session.currentPosition)
      throw conflict();
    const { correct, masteryEligible, normalizedAnswer } = evaluateAnswer(question, input.answer);
    await tx.practiceQuestion.update({
      where: { id: question.id },
      data: {
        answer: input.answer,
        normalizedAnswer,
        correct,
        masteryEligible,
        answeredAt: new Date(),
        resolution: 'ANSWERED',
        resolvedAt: new Date(),
      },
    });
    await tx.practiceSession.update({ where: { id }, data: { version: { increment: 1 } } });
    return { session: await view(tx, ownerId, id), applied: true };
  });
}

export async function advancePractice(
  db: PrismaClient,
  ownerId: string,
  id: string,
  input: { questionId: string; version: number },
) {
  return practiceTransaction(db, async (tx) => {
    const session = await locked(tx, ownerId, id);
    if (session.status !== 'ACTIVE') throw conflict();
    const question = session.questions.find((q) => q.id === input.questionId);
    if (!question || question.resolution === null) throw conflict();
    if (question.position < session.currentPosition)
      return { session: await view(tx, ownerId, id), applied: false };
    if (session.version !== input.version || question.position !== session.currentPosition)
      throw conflict();
    await tx.practiceSession.update({
      where: { id },
      data: {
        currentPosition: { increment: 1 },
        version: { increment: 1 },
      },
    });
    return { session: await view(tx, ownerId, id), applied: true };
  });
}

export async function finishPractice(
  db: PrismaClient,
  ownerId: string,
  id: string,
  cancel = false,
) {
  return practiceTransaction(db, async (tx) => {
    const session = await locked(tx, ownerId, id);
    const desired = cancel ? 'CANCELED' : 'COMPLETED';
    if (session.status === desired) return { session: await view(tx, ownerId, id), applied: false };
    if (session.status !== 'ACTIVE') throw conflict();
    if (cancel) {
      await tx.practiceSession.update({
        where: { id },
        data: {
          status: 'CANCELED',
          canceledAt: new Date(),
          version: { increment: 1 },
        },
      });
    } else {
      if (
        session.questions.length !== session.questionCount ||
        session.questions.some((q) => q.resolution === null)
      )
        throw conflict();
      // The shared list row lock orders these events after earlier committed flashcard
      // evaluations. Never order game evidence by the practice session's creation time.
      const now = new Date();
      const credited = new Set<string>();
      const eligibleIds = [
        ...new Set(
          session.questions.flatMap((q) => (q.masteryEligible && q.wordId ? [q.wordId] : [])),
        ),
      ];
      const eligible =
        (session.wordListId || session.practiceType === 'mixed') && eligibleIds.length
          ? await tx.word.findMany({
              where: {
                id: { in: eligibleIds },
                ...(session.wordListId ? { wordListId: session.wordListId } : {}),
                wordList: { ownerId },
              },
              select: { id: true, wordListId: true, progress: true },
              orderBy: { id: 'asc' },
            })
          : [];
      for (const word of eligible) {
        if (
          session.practiceType === 'mixed' &&
          !session.questions.some(
            (q) => q.wordId === word.id && q.originListId === word.wordListId && q.masteryEligible,
          )
        )
          continue;
        const next = applyEvaluation(word.progress ?? initialProgress, 'known');
        await tx.wordProgress.upsert({
          where: { wordId: word.id },
          create: { wordId: word.id, ...next },
          update: next,
        });
        credited.add(word.id);
      }
      if (credited.size)
        await tx.practiceQuestion.updateMany({
          where: { sessionId: id, wordId: { in: [...credited] }, masteryEligible: true },
          data: { masteryApplied: true },
        });
      const game = await tx.completedGame.create({
        data: {
          // PracticeSession retains the source relation and immutable title. Keeping
          // this legacy FK null preserves practice history without changing legacy cascades.
          ownerId,
          completionId: session.id,
          wordListId: null,
          listTitle: session.listTitle,
          gameType: session.practiceType,
          completedAt: now,
          requestHash: 'server-authoritative',
          items: session.questions.map((q) => ({
            wordId: q.wordId,
            english: q.english,
            meanings: q.meanings,
            answer: q.answer,
            outcome:
              q.activityType === 'flashcard'
                ? q.answer === 'known'
                  ? 'self_known'
                  : 'self_missed'
                : q.resolution === 'AUDIO_UNAVAILABLE'
                  ? 'audio_unavailable'
                  : q.correct
                    ? 'correct'
                    : 'incorrect',
            attempts: q.resolution === 'AUDIO_UNAVAILABLE' ? 0 : 1,
            masteryEligible: q.masteryEligible,
            masteryApplied: q.wordId !== null && credited.has(q.wordId),
            ...(session.practiceType === 'mixed'
              ? {
                  activityType: q.activityType,
                  originListId: q.originListId,
                  originListTitle: q.originListTitle,
                  sourceWordId: q.sourceWordId,
                  practiceSessionId: id,
                }
              : {}),
          })),
        },
      });
      await tx.practiceSession.update({
        where: { id },
        data: {
          status: 'COMPLETED',
          completedAt: now,
          completedGameId: game.id,
          version: { increment: 1 },
        },
      });
    }
    return { session: await view(tx, ownerId, id), applied: true };
  });
}

/** A client reports device audio failure; it cannot create learning evidence. */
export async function skipPractice(
  db: PrismaClient,
  ownerId: string,
  id: string,
  input: { questionId: string; version: number },
) {
  return practiceTransaction(db, async (tx) => {
    const session = await locked(tx, ownerId, id);
    if (session.status !== 'ACTIVE') throw conflict();
    const q = session.questions.find((q) => q.id === input.questionId);
    if (!q) throw conflict();
    if (
      session.practiceType !== 'listening' &&
      !(session.practiceType === 'mixed' && q.activityType === 'listening')
    )
      throw conflict();
    if (q.resolution === 'AUDIO_UNAVAILABLE')
      return { session: await view(tx, ownerId, id), applied: false };
    if (
      q.resolution !== null ||
      q.position !== session.currentPosition ||
      session.version !== input.version
    )
      throw conflict();
    await tx.practiceQuestion.update({
      where: { id: q.id },
      data: { resolution: 'AUDIO_UNAVAILABLE', resolvedAt: new Date() },
    });
    await tx.practiceSession.update({ where: { id }, data: { version: { increment: 1 } } });
    return { session: await view(tx, ownerId, id), applied: true };
  });
}

/** No client text: authorize the current snapshot before any provider/cache access. */
export async function speechQuestion(
  db: PrismaClient,
  ownerId: string,
  id: string,
  questionId: string,
) {
  const q = await db.practiceQuestion.findFirst({
    where: { id: questionId, sessionId: id, session: { ownerId } },
    select: {
      english: true,
      position: true,
      resolution: true,
      activityType: true,
      session: { select: { status: true, practiceType: true, currentPosition: true } },
    },
  });
  if (!q) throw missing();
  if (
    q.session.status !== 'ACTIVE' ||
    (q.session.practiceType !== 'listening' &&
      !(q.session.practiceType === 'mixed' && q.activityType === 'listening')) ||
    q.position !== q.session.currentPosition ||
    q.resolution !== null
  )
    throw conflict();
  return q.english;
}
