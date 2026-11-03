import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { PrismaClient } from '../generated/prisma/client.js';
import { ApplicationError } from '../http/errors.js';

const querySchema = z.object({ after: z.uuid().optional() }).strict();
export function registerReviewRoutes(
  app: FastifyInstance,
  database: () => PrismaClient,
  owner: (request: object) => string,
) {
  app.get('/review', async (request) => {
    const parsed = querySchema.safeParse(request.query);
    if (!parsed.success) throw new ApplicationError(400, 'VALIDATION_FAILED');
    const ownerId = owner(request);
    const owned = { word: { wordList: { ownerId } } };
    const [evaluatedCount, total, rows] = await database().$transaction([
      database().wordProgress.count({ where: owned }),
      database().wordProgress.count({ where: { ...owned, needsReview: true } }),
      database().wordProgress.findMany({
        where: {
          ...owned,
          needsReview: true,
          ...(parsed.data.after ? { wordId: { gt: parsed.data.after } } : {}),
        },
        orderBy: { wordId: 'asc' },
        take: 101,
        select: {
          wordId: true,
          knownStreak: true,
          word: {
            select: {
              english: true,
              meanings: { select: { turkish: true }, orderBy: { position: 'asc' } },
              wordList: {
                select: {
                  id: true,
                  title: true,
                  studySessions: {
                    where: { ownerId, status: 'ACTIVE' },
                    select: { id: true },
                    take: 1,
                  },
                },
              },
            },
          },
        },
      }),
    ]);
    const page = rows.slice(0, 100);
    return {
      evaluatedCount,
      total,
      next: rows.length > 100 ? page.at(-1)!.wordId : null,
      words: page.map(({ wordId, knownStreak, word }) => ({
        wordId,
        knownStreak,
        english: word.english,
        meanings: word.meanings.map((m) => m.turkish),
        listId: word.wordList.id,
        listTitle: word.wordList.title,
        activeSessionId: word.wordList.studySessions[0]?.id ?? null,
      })),
    };
  });
}
