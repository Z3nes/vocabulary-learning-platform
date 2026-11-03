import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { PrismaClient } from '../generated/prisma/client.js';
import { ApplicationError } from '../http/errors.js';
import { submissionSchema } from '../vocabulary/input.js';
import { deleteWord, editWord, processVocabulary, wordSelection } from '../vocabulary/service.js';

const paramsSchema = z.object({ listId: z.uuid(), wordId: z.uuid().optional() });
const commitSchema = z
  .object({ submission: submissionSchema, token: z.string().max(128) })
  .strict();

/** Registered inside the personal route scope: shares authentication and JSON/error contracts. */
export function registerWordRoutes(
  app: FastifyInstance,
  database: () => PrismaClient,
  owner: (request: object) => string,
) {
  function params(value: unknown) {
    const parsed = paramsSchema.safeParse(value);
    if (!parsed.success) throw new ApplicationError(400, 'VALIDATION_FAILED');
    return parsed.data;
  }
  async function ownedList(listId: string, ownerId: string) {
    if (
      !(await database().wordList.findFirst({
        where: { id: listId, ownerId },
        select: { id: true },
      }))
    )
      throw new ApplicationError(404, 'LIST_NOT_FOUND');
  }
  const base = '/lists/:listId/words';
  app.get(base, async (request) => {
    const { listId } = params(request.params);
    const ownerId = owner(request);
    await ownedList(listId, ownerId);
    return {
      words: await database().word.findMany({
        where: { wordListId: listId, wordList: { ownerId } },
        select: wordSelection,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      }),
    };
  });
  app.get(`${base}/:wordId`, async (request) => {
    const { listId, wordId } = params(request.params);
    const ownerId = owner(request);
    await ownedList(listId, ownerId);
    const word = await database().word.findFirst({
      where: { id: wordId!, wordListId: listId, wordList: { ownerId } },
      select: wordSelection,
    });
    if (!word) throw new ApplicationError(404, 'WORD_NOT_FOUND');
    return { word };
  });
  // Allow escaped 100 KB raw text plus explicit per-meaning decisions; raw limits
  // are still enforced by the shared parser and unrelated routes keep their limits.
  const bulkTransportLimit = 4 * 1024 * 1024;
  app.post(`${base}/preview`, { bodyLimit: bulkTransportLimit }, async (request) => {
    const { listId } = params(request.params);
    const parsed = submissionSchema.safeParse(request.body);
    if (!parsed.success) throw new ApplicationError(400, 'VALIDATION_FAILED');
    return processVocabulary(database(), owner(request), listId, parsed.data);
  });
  app.post(`${base}/commit`, { bodyLimit: bulkTransportLimit }, async (request) => {
    const { listId } = params(request.params);
    const parsed = commitSchema.safeParse(request.body);
    if (!parsed.success) throw new ApplicationError(400, 'VALIDATION_FAILED');
    return processVocabulary(
      database(),
      owner(request),
      listId,
      parsed.data.submission,
      parsed.data.token,
    );
  });
  app.patch(`${base}/:wordId`, async (request) => {
    const { listId, wordId } = params(request.params);
    return editWord(database(), owner(request), listId, wordId!, request.body);
  });
  app.delete(`${base}/:wordId`, async (request, reply) => {
    const { listId, wordId } = params(request.params);
    await deleteWord(database(), owner(request), listId, wordId!);
    return reply.code(204).send();
  });
}
