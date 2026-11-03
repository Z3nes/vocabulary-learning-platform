import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { PrismaClient } from '../generated/prisma/client.js';
import { ApplicationError } from '../http/errors.js';
import { studyActions } from '../study/queue.js';
import { studyPercentages } from '../study/selection.js';
import {
  actOnCard,
  endSession,
  getActiveSession,
  getSession,
  listSessions,
  startSession,
} from '../study/service.js';

const listParams = z.object({ listId: z.uuid() });
const sessionParams = z.object({ sessionId: z.uuid() });
const startSchema = z
  .object({ percentage: z.literal(studyPercentages), direction: z.enum(['en-tr', 'tr-en']) })
  .strict();
const actionSchema = z
  .object({ cardId: z.uuid(), version: z.int().min(0), action: z.enum(studyActions) })
  .strict();
const endSchema = z.object({}).strict();

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new ApplicationError(400, 'VALIDATION_FAILED');
  return parsed.data;
}

/**
 * Study sessions. Registered inside the personal route scope: shares authentication,
 * the JSON content-type rule for POST, `cache-control: no-store` and the error format.
 * Every query is scoped to the authenticated owner; foreign ids behave as missing.
 */
export function registerStudyRoutes(
  app: FastifyInstance,
  database: () => PrismaClient,
  owner: (request: object) => string,
) {
  app.post('/review/study-sessions', async (request, reply) => {
    const input = parse(startSchema.extend({ listId: z.uuid().nullable() }).strict(), request.body);
    return reply.code(201).send({
      session: await startSession(database(), owner(request), input.listId, {
        ...input,
        reviewOnly: true,
      }),
    });
  });
  app.get('/review/study-sessions/active', async (request) => {
    const query = parse(z.object({ listId: z.uuid().optional() }).strict(), request.query);
    return {
      session: await getActiveSession(database(), owner(request), query.listId ?? null, true),
    };
  });
  app.post('/review/study-sessions/eligibility', async (request) => {
    const { listId } = parse(z.object({ listId: z.uuid().nullable() }).strict(), request.body);
    if (
      listId &&
      !(await database().wordList.findFirst({ where: { id: listId, ownerId: owner(request) } }))
    )
      throw new ApplicationError(404, 'LIST_NOT_FOUND');
    return {
      count: await database().word.count({
        where: {
          ...(listId ? { wordListId: listId } : {}),
          wordList: { ownerId: owner(request) },
          progress: { needsReview: true },
        },
      }),
    };
  });
  app.get('/lists/:listId/study-sessions/active', async (request) => ({
    session: await getActiveSession(
      database(),
      owner(request),
      parse(listParams, request.params).listId,
    ),
  }));
  app.get('/lists/:listId/study-sessions', async (request) => ({
    sessions: await listSessions(
      database(),
      owner(request),
      parse(listParams, request.params).listId,
    ),
  }));
  app.post('/lists/:listId/study-sessions', async (request, reply) => {
    const { listId } = parse(listParams, request.params);
    const options = parse(startSchema, request.body);
    const session = await startSession(database(), owner(request), listId, options);
    return reply.code(201).send({ session });
  });
  app.get('/study-sessions/:sessionId', async (request) => ({
    session: await getSession(
      database(),
      owner(request),
      parse(sessionParams, request.params).sessionId,
    ),
  }));
  app.post('/study-sessions/:sessionId/actions', async (request) => {
    const { sessionId } = parse(sessionParams, request.params);
    return actOnCard(database(), owner(request), sessionId, parse(actionSchema, request.body));
  });
  app.post('/study-sessions/:sessionId/end', async (request) => {
    const { sessionId } = parse(sessionParams, request.params);
    parse(endSchema, request.body ?? {});
    return endSession(database(), owner(request), sessionId);
  });
}
