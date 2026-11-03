import { createHash } from 'node:crypto';
import { Prisma, type PrismaClient } from '../generated/prisma/client.js';
import { ApplicationError } from '../http/errors.js';
import { lockList } from '../vocabulary/service.js';
import type { CompletionInput } from './input.js';

export async function completeGame(db: PrismaClient, ownerId: string, input: CompletionInput) {
  const requestHash = createHash('sha256').update(JSON.stringify(input)).digest('hex');
  // Serialize completion keys even across different lists, before taking the list lock.
  return db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${ownerId + ':' + input.completionId}, 0))`;
      await lockList(tx, input.listId, ownerId);
      const existing = await tx.completedGame.findUnique({
        where: { ownerId_completionId: { ownerId, completionId: input.completionId } },
      });
      if (existing) {
        if (existing.requestHash !== requestHash)
          throw new ApplicationError(409, 'GAME_COMPLETION_CONFLICT');
        return { game: existing, applied: false };
      }
      const list = await tx.wordList.findFirstOrThrow({ where: { id: input.listId, ownerId } });
      const words = await tx.word.findMany({
        where: { id: { in: input.items.flatMap((item) => (item.wordId ? [item.wordId] : [])) } },
        select: { id: true, wordListId: true, wordList: { select: { ownerId: true } } },
      });
      if (
        words.some((word) => word.wordListId !== input.listId || word.wordList.ownerId !== ownerId)
      )
        throw new ApplicationError(404, 'WORD_NOT_FOUND');
      const present = new Set(words.map((word) => word.id));
      const game = await tx.completedGame.create({
        data: {
          ownerId,
          completionId: input.completionId,
          wordListId: input.listId,
          listTitle: list.title,
          gameType: input.gameType,
          requestHash,
          items: input.items.map((item) => ({
            ...item,
            wordId: item.wordId && present.has(item.wordId) ? item.wordId : null,
          })),
        },
      });
      return { game, applied: true };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
  );
}
