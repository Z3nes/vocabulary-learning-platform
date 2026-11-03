import type { Prisma, PrismaClient } from '../generated/prisma/client.js';
import { ApplicationError } from '../http/errors.js';
import { englishKey } from '../vocabulary/input.js';
import { lockList } from '../vocabulary/service.js';
import { sessionCardCount, shuffle, type StudyPercentage } from '../study/selection.js';
import { createAnswerSnapshotter } from './evaluation.js';
import { choiceDataSchema, planMixed, type MixedWord } from './mixedPlan.js';
import { getPractice, lockPractice, lockPracticeLists, practiceTransaction } from './service.js';

const conflict = () => new ApplicationError(409, 'PRACTICE_CONFLICT');
async function scopePool(
  db: PrismaClient | Prisma.TransactionClient,
  ownerId: string,
  listId: string | null,
  lockedIds?: string[],
) {
  const list = listId ? await db.wordList.findFirst({ where: { id: listId, ownerId } }) : null;
  if (listId && !list) throw new ApplicationError(404, 'LIST_NOT_FOUND');
  const rows = await db.word.findMany({
    where: {
      wordList: { ownerId },
      ...(listId ? { wordListId: listId } : lockedIds ? { wordListId: { in: lockedIds } } : {}),
    },
    include: { wordList: { select: { title: true } }, meanings: { orderBy: { position: 'asc' } } },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
  const words: MixedWord[] = rows.map((w) => ({
    id: w.id,
    english: w.english,
    meanings: w.meanings.map((m) => m.turkish),
    originListId: w.wordListId,
    originListTitle: w.wordList.title,
  }));
  return { words, title: list?.title ?? 'Tüm listelerin' };
}
export async function mixedSetup(db: PrismaClient, ownerId: string, listId: string | null) {
  const pool = await scopePool(db, ownerId, listId);
  const active = await db.practiceSession.findFirst({
    where: {
      ownerId,
      practiceType: 'mixed',
      status: 'ACTIVE',
      scopeKey: listId ? `LIST:${listId}` : 'ALL_LISTS',
    },
  });
  const resumable = await db.practiceSession.findMany({
    where: { ownerId, practiceType: 'mixed', status: 'ACTIVE' },
    select: { id: true, listTitle: true, questionCount: true },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  });
  return {
    eligibleCount: pool.words.length,
    title: pool.title,
    session: active ? await getPractice(db, ownerId, active.id) : null,
    resumable,
  };
}
export async function startMixed(
  db: PrismaClient,
  ownerId: string,
  listId: string | null,
  percentage: StudyPercentage,
) {
  return practiceTransaction(db, async (tx) => {
    const ids = listId
      ? (await lockList(tx, listId, ownerId), [listId])
      : await lockPracticeLists(tx, ownerId);
    const scopeKey = listId ? `LIST:${listId}` : 'ALL_LISTS';
    if (
      await tx.practiceSession.findFirst({
        where: { ownerId, practiceType: 'mixed', scopeKey, status: 'ACTIVE' },
      })
    )
      throw new ApplicationError(409, 'PRACTICE_SESSION_ACTIVE');
    const pool = await scopePool(tx, ownerId, listId, ids);
    if (!pool.words.length) throw new ApplicationError(409, 'STUDY_LIST_EMPTY');
    const selected = shuffle(pool.words).slice(0, sessionCardCount(pool.words.length, percentage));
    const byList = new Map<string, MixedWord[]>();
    for (const w of pool.words) {
      const group = byList.get(w.originListId) ?? [];
      group.push(w);
      byList.set(w.originListId, group);
    }
    const snapshots = new Map(
      [...byList].map(([id, words]) => [id, createAnswerSnapshotter(words)]),
    );
    const plan = planMixed(selected, pool.words);
    const session = await tx.practiceSession.create({
      data: {
        ownerId,
        wordListId: listId,
        scopeKey,
        listTitle: pool.title,
        practiceType: 'mixed',
        percentage,
        eligibleCount: pool.words.length,
        questionCount: plan.length,
        questions: {
          createMany: {
            data: plan.map(({ word: w, activityType, choices }, position) => ({
              wordId: w.id,
              sourceWordId: w.id,
              english: w.english,
              meanings: w.meanings,
              position,
              activityType,
              originListId: w.originListId,
              originListTitle: w.originListTitle,
              ...(choices ? { modeData: choices } : {}),
              ...(activityType === 'written-recall'
                ? snapshots.get(w.originListId)!(w)
                : { acceptedAnswers: [englishKey(w.english)], overlappingAnswers: [] }),
            })),
          },
        },
      },
    });
    return getPractice(tx, ownerId, session.id);
  });
}
export async function mixedAction(
  db: PrismaClient,
  ownerId: string,
  id: string,
  input: { questionId: string; version: number } & (
    | { action: 'reveal' }
    | { action: 'self-evaluation'; evaluation: 'known' | 'missed' }
    | { action: 'choice'; optionId: string }
  ),
) {
  return practiceTransaction(db, async (tx) => {
    const session = await lockPractice(tx, ownerId, id);
    if (session.practiceType !== 'mixed' || session.status !== 'ACTIVE') throw conflict();
    const q = session.questions.find((q) => q.id === input.questionId);
    if (!q) throw conflict();
    const required = input.action === 'choice' ? 'choice' : 'flashcard';
    if (q.activityType !== required) throw conflict();
    if (input.action === 'reveal' && q.revealedAt)
      return { session: await getPractice(tx, ownerId, id), applied: false };
    const answer =
      input.action === 'choice'
        ? input.optionId
        : input.action === 'self-evaluation'
          ? input.evaluation
          : null;
    if (q.resolution !== null) {
      if (answer !== q.answer) throw conflict();
      return { session: await getPractice(tx, ownerId, id), applied: false };
    }
    if (q.position !== session.currentPosition || input.version !== session.version)
      throw conflict();
    if (input.action === 'reveal')
      await tx.practiceQuestion.update({ where: { id: q.id }, data: { revealedAt: new Date() } });
    else {
      if (input.action === 'self-evaluation' && !q.revealedAt) throw conflict();
      const choices = input.action === 'choice' ? choiceDataSchema.parse(q.modeData) : null;
      if (choices && !choices.options.some((o) => o.id === answer))
        throw new ApplicationError(400, 'VALIDATION_FAILED');
      await tx.practiceQuestion.update({
        where: { id: q.id },
        data: {
          answer,
          normalizedAnswer: answer,
          correct: choices ? choices.correctOptionId === answer : null,
          masteryEligible: input.action === 'self-evaluation' && input.evaluation === 'known',
          resolution: 'ANSWERED',
          answeredAt: new Date(),
          resolvedAt: new Date(),
        },
      });
    }
    await tx.practiceSession.update({ where: { id }, data: { version: { increment: 1 } } });
    return { session: await getPractice(tx, ownerId, id), applied: true };
  });
}
