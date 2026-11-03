import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { PrismaClient } from '../generated/prisma/client.js';
import { ApplicationError } from '../http/errors.js';
import { exampleService, type ExampleService } from '../examples/service.js';
import { ExampleRateLimit } from '../examples/rateLimit.js';

const wordParams = z.object({ listId: z.uuid(), wordId: z.uuid() }).strict();
const cardParams = z.object({ sessionId: z.uuid(), cardId: z.uuid() }).strict();
const excludeIds = z
  .string()
  .max(160)
  .transform((value) => value.split(','))
  .pipe(
    z
      .array(
        z
          .string()
          .regex(/^[1-9]\d{0,15}$/u)
          .refine((id) => Number.isSafeInteger(Number(id))),
      )
      .max(9)
      .refine((ids) => new Set(ids).size === ids.length),
  );
const querySchema = z.object({ exclude: excludeIds.optional() }).strict();
function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new ApplicationError(400, 'VALIDATION_FAILED');
  return result.data;
}

/** Inside the existing authenticated personal-data scope. No writes, arbitrary
 * vocabulary text or caller-supplied identity; ownership precedes shared cache.
 * Answer reveal is local UI state, not a backend authorization assertion.
 */
export function registerExampleRoutes(
  app: FastifyInstance,
  database: () => PrismaClient,
  owner: (request: object) => string,
  service: ExampleService = exampleService,
  limiter = new ExampleRateLimit(),
) {
  const options = {
    preHandler: (request: object) =>
      Promise.resolve().then(() => {
        limiter.check(owner(request));
      }),
  };
  app.get('/lists/:listId/words/:wordId/examples', options, async (request) => {
    const { listId, wordId } = parse(wordParams, request.params);
    const { exclude = [] } = parse(querySchema, request.query);
    const ownerId = owner(request);
    const word = await database().word.findFirst({
      where: { id: wordId, wordListId: listId, wordList: { ownerId } },
      select: { english: true },
    });
    if (!word) throw new ApplicationError(404, 'WORD_NOT_FOUND');
    return service.lookup(word.english, exclude);
  });
  app.get('/study-sessions/:sessionId/cards/:cardId/examples', options, async (request) => {
    const { sessionId, cardId } = parse(cardParams, request.params);
    const { exclude = [] } = parse(querySchema, request.query);
    const card = await database().studyCard.findFirst({
      where: { id: cardId, sessionId, session: { ownerId: owner(request), status: 'ACTIVE' } },
      select: { english: true },
    });
    if (!card) throw new ApplicationError(404, 'STUDY_CARD_NOT_FOUND');
    return service.lookup(card.english, exclude);
  });
}
