import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { Prisma, type PrismaClient } from '../generated/prisma/client.js';
import { ApplicationError } from '../http/errors.js';
import {
  editSchema,
  englishKey,
  issues,
  meaningKey,
  parseSubmission,
  type Submission,
} from './input.js';
import { planVocabulary } from './plan.js';

// Stateless approval receipts are scoped to this server process. Restarting requires a new preview.
const signingKey = randomBytes(32);
export const wordSelection = {
  id: true,
  english: true,
  normalizedEnglishKey: true,
  createdAt: true,
  updatedAt: true,
  meanings: {
    select: { id: true, turkish: true, normalizedMeaningKey: true, position: true },
    orderBy: { position: 'asc' as const },
  },
} as const;
type Transaction = Prisma.TransactionClient;

/** All vocabulary mutations acquire the same owned parent lock before reading words. */
export async function lockList(tx: Transaction, listId: string, ownerId: string) {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "WordList" WHERE "id" = ${listId}::uuid AND "ownerId" = ${ownerId}::uuid FOR UPDATE`;
  if (!rows.length) throw new ApplicationError(404, 'LIST_NOT_FOUND');
}

async function transaction<T>(
  db: PrismaClient,
  operation: (tx: Transaction) => Promise<T>,
): Promise<T> {
  // The parent lock serializes application writes; uniqueness also protects against external races.
  for (let attempt = 0; ; attempt++) {
    try {
      return await db.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        maxWait: 10_000,
        timeout: 20_000,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        ['P2002', 'P2034'].includes(error.code) &&
        attempt < 2
      )
        continue;
      throw error;
    }
  }
}

export async function processVocabulary(
  db: PrismaClient,
  ownerId: string,
  listId: string,
  submission: Submission,
  approvedToken?: string,
) {
  // Commit reparses authoritative input; no client classifications or counts are accepted.
  const input = parseSubmission(submission);
  return transaction(db, async (tx) => {
    await lockList(tx, listId, ownerId);
    const stored = await tx.word.findMany({
      where: {
        wordListId: listId,
        wordList: { ownerId },
        normalizedEnglishKey: { in: [...new Set(input.entries.map((entry) => entry.key))] },
      },
      select: wordSelection,
      orderBy: { normalizedEnglishKey: 'asc' },
    });
    const decisions = [...(submission.decisions ?? [])].sort((a, b) =>
      a.id.localeCompare(b.id, 'en-US'),
    );
    // Bind choices to exact input/source positions and the current owned snapshot.
    // Check freshness before validating choices: a removed candidate requires re-preview.
    const token = createHmac('sha256', signingKey)
      .update(JSON.stringify({ ownerId, listId, input, stored, decisions }))
      .digest('hex');
    if (approvedToken !== undefined && input.invalid.length)
      throw new ApplicationError(
        400,
        submission.kind === 'bulk'
          ? 'BULK_INVALID_CONTENT'
          : (input.invalid[0]?.codes[0] ?? 'VALIDATION_FAILED'),
      );
    if (
      approvedToken !== undefined &&
      (!/^[a-f0-9]{64}$/u.test(approvedToken) ||
        !timingSafeEqual(Buffer.from(token), Buffer.from(approvedToken)))
    ) {
      throw new ApplicationError(409, 'PREVIEW_STALE');
    }
    const { changes, ...preview } = planVocabulary(input, stored, decisions);
    if (approvedToken === undefined) return { ...preview, token };
    if (preview.unresolvedDecisions)
      throw new ApplicationError(409, 'SIMILARITY_DECISION_REQUIRED');
    if (changes.length) {
      // Allocate IDs before inserts so the entire batch uses bounded bulk queries.
      const records = changes.map((word) => ({ ...word, targetId: word.id ?? randomUUID() }));
      const newWords = records.filter((word) => !word.id);
      if (newWords.length)
        await tx.word.createMany({
          data: newWords.map((word) => ({
            id: word.targetId,
            wordListId: listId,
            english: word.english,
            normalizedEnglishKey: word.key,
          })),
        });
      await tx.wordMeaning.createMany({
        data: records.flatMap((word) =>
          word.additions.map((meaning, index) => ({
            wordId: word.targetId,
            turkish: meaning.turkish,
            normalizedMeaningKey: meaning.key,
            position: word.nextPosition + index,
          })),
        ),
      });
      const mergedIds = records.filter((word) => word.id).map((word) => word.targetId);
      if (mergedIds.length)
        await tx.word.updateMany({
          where: { id: { in: mergedIds }, wordListId: listId, wordList: { ownerId } },
          data: { updatedAt: new Date() },
        });
      await touchList(tx, listId, ownerId);
    }
    return { ...preview, token, changed: changes.length > 0 };
  });
}

async function touchList(tx: Transaction, listId: string, ownerId: string) {
  // Monotonic even for multiple mutations in one millisecond; exactly one update per transaction.
  await tx.$executeRaw`UPDATE "WordList" SET "updatedAt" = GREATEST(clock_timestamp(), "updatedAt" + interval '1 millisecond')
    WHERE "id" = ${listId}::uuid AND "ownerId" = ${ownerId}::uuid`;
}

export async function editWord(
  db: PrismaClient,
  ownerId: string,
  listId: string,
  wordId: string,
  body: unknown,
) {
  const parsed = editSchema.safeParse(body);
  if (!parsed.success)
    throw new ApplicationError(400, issues(parsed.error)[0] ?? 'VALIDATION_FAILED');
  const value = parsed.data;
  return transaction(db, async (tx) => {
    await lockList(tx, listId, ownerId);
    const word = await tx.word.findFirst({
      where: { id: wordId, wordListId: listId, wordList: { ownerId } },
      select: wordSelection,
    });
    if (!word) throw new ApplicationError(404, 'WORD_NOT_FOUND');
    const key = englishKey(value.english);
    const collision = await tx.word.findFirst({
      where: {
        wordListId: listId,
        wordList: { ownerId },
        normalizedEnglishKey: key,
        id: { not: wordId },
      },
      select: { id: true },
    });
    if (collision) throw new ApplicationError(409, 'WORD_ALREADY_EXISTS');
    const meaningsChanged =
      JSON.stringify(word.meanings.map((meaning) => meaning.turkish)) !==
      JSON.stringify(value.meanings);
    const changed = word.english !== value.english || meaningsChanged;
    if (!changed) return { word, changed: false };
    // Complete replacement is intentional; meaning-level learning data does not exist.
    if (meaningsChanged)
      await tx.wordMeaning.deleteMany({
        where: { wordId, word: { wordListId: listId, wordList: { ownerId } } },
      });
    const updated = await tx.word.update({
      where: { id: wordId, wordListId: listId, wordList: { ownerId } },
      data: {
        english: value.english,
        normalizedEnglishKey: key,
        updatedAt: new Date(),
        ...(meaningsChanged
          ? {
              meanings: {
                create: value.meanings.map((turkish, position) => ({
                  turkish,
                  normalizedMeaningKey: meaningKey(turkish),
                  position,
                })),
              },
            }
          : {}),
      },
      select: wordSelection,
    });
    await touchList(tx, listId, ownerId);
    return { word: updated, changed: true };
  });
}

export async function deleteWord(
  db: PrismaClient,
  ownerId: string,
  listId: string,
  wordId: string,
) {
  return transaction(db, async (tx) => {
    await lockList(tx, listId, ownerId);
    const result = await tx.word.deleteMany({
      where: { id: wordId, wordListId: listId, wordList: { ownerId } },
    });
    if (!result.count) throw new ApplicationError(404, 'WORD_NOT_FOUND');
    await touchList(tx, listId, ownerId);
  });
}
