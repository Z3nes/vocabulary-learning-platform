import type { FastifyPluginCallback } from 'fastify';
import { z } from 'zod';
import { resolveUser, type IdentityProvider } from '../auth/identity.js';
import type { PrismaClient } from '../generated/prisma/client.js';
import { ApplicationError, installErrorHandler } from '../http/errors.js';
import { registerStudyRoutes } from './study.js';
import { registerGameRoutes } from './games.js';
import { registerActivityRoutes } from './activity.js';
import { registerReviewRoutes } from './review.js';
import { registerWordRoutes } from './words.js';
import { registerExampleRoutes } from './examples.js';
import type { ExampleService } from '../examples/service.js';
import { registerPracticeRoutes } from './practice.js';
import type { SpeechService } from '../speech/service.js';
import { registerPuzzleRoutes } from './puzzles.js';

const titleSchema = z
  .string()
  .transform((value) => value.normalize('NFC').trim())
  .refine((value) => [...value].length > 0, 'TITLE_REQUIRED')
  .refine((value) => [...value].length <= 100, 'TITLE_TOO_LONG');
const bodySchema = z.object({ title: titleSchema }).strict();
const paramsSchema = z.object({ id: z.uuid() });
const selection = {
  id: true,
  title: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { words: true } },
} as const;
function counted<T extends { _count: { words: number } }>(row: T) {
  const { _count, ...list } = row;
  return { ...list, wordCount: _count.words };
}

interface ListRouteOptions {
  speech: SpeechService;
  exampleSentencesEnabled?: boolean;
  examples?: ExampleService | undefined;
  db: PrismaClient | undefined;
  identityProvider: IdentityProvider | undefined;
}

export const listRoutes: FastifyPluginCallback<ListRouteOptions> = (app, options, done) => {
  const { db, identityProvider } = options;
  const users = new WeakMap<object, string>();

  installErrorHandler(app);

  app.addHook('onRequest', async (request, reply) => {
    reply.header('cache-control', 'no-store');
    if (!identityProvider) throw new ApplicationError(401, 'UNAUTHENTICATED');
    const identity = await identityProvider.resolve(request);
    if (!identity) throw new ApplicationError(401, 'UNAUTHENTICATED');
    if (!db) throw new ApplicationError(503, 'INTERNAL_ERROR');
    users.set(request, await resolveUser(db, identity));
    const hasBody =
      request.headers['transfer-encoding'] !== undefined ||
      Number(request.headers['content-length'] ?? 0) > 0;
    if (
      request.method === 'POST' ||
      request.method === 'PATCH' ||
      (request.method === 'DELETE' && hasBody)
    ) {
      if (
        request.headers['content-type']?.split(';')[0]?.trim().toLowerCase() !== 'application/json'
      ) {
        throw new ApplicationError(415, 'VALIDATION_FAILED');
      }
    }
  });

  function owner(request: object): string {
    const id = users.get(request);
    if (!id) throw new ApplicationError(401, 'UNAUTHENTICATED');
    return id;
  }
  function id(params: unknown): string {
    const parsed = paramsSchema.safeParse(params);
    if (!parsed.success) throw new ApplicationError(400, 'VALIDATION_FAILED');
    return parsed.data.id;
  }
  function title(body: unknown): string {
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      const code =
        parsed.error.issues.find((issue) =>
          ['TITLE_REQUIRED', 'TITLE_TOO_LONG'].includes(issue.message),
        )?.message ?? 'VALIDATION_FAILED';
      throw new ApplicationError(400, code);
    }
    return parsed.data.title;
  }
  function database(): PrismaClient {
    if (!db) throw new ApplicationError(503, 'INTERNAL_ERROR');
    return db;
  }

  app.get('/lists', async (request) => ({
    lists: (
      await database().wordList.findMany({
        where: { ownerId: owner(request) },
        select: selection,
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      })
    ).map(counted),
  }));
  app.post('/lists', async (request, reply) => {
    const list = await database().wordList.create({
      data: { ownerId: owner(request), title: title(request.body) },
      select: selection,
    });
    return reply.code(201).send({ list: counted(list) });
  });
  app.get('/lists/:id', async (request) => {
    const list = await database().wordList.findFirst({
      where: { id: id(request.params), ownerId: owner(request) },
      select: selection,
    });
    if (!list) throw new ApplicationError(404, 'LIST_NOT_FOUND');
    return { list: counted(list) };
  });
  app.patch('/lists/:id', async (request) => {
    const listId = id(request.params);
    const value = title(request.body);
    const ownerId = owner(request);
    const list = await database().$transaction(async (tx) => {
      // updateManyAndReturn cannot select relation counts. Keep the owned update and
      // counted read together; the UPDATE row lock also serializes vocabulary writes.
      const result = await tx.wordList.updateMany({
        where: { id: listId, ownerId },
        data: { title: value },
      });
      if (!result.count) throw new ApplicationError(404, 'LIST_NOT_FOUND');
      return tx.wordList.findFirstOrThrow({
        where: { id: listId, ownerId },
        select: selection,
      });
    });
    return { list: counted(list) };
  });
  app.delete('/lists/:id', async (request, reply) => {
    const result = await database().wordList.deleteMany({
      where: { id: id(request.params), ownerId: owner(request) },
    });
    if (!result.count) throw new ApplicationError(404, 'LIST_NOT_FOUND');
    return reply.code(204).send();
  });
  registerWordRoutes(app, database, owner);
  registerStudyRoutes(app, database, owner);
  registerGameRoutes(app, database, owner);
  registerPuzzleRoutes(app, database, owner);
  registerActivityRoutes(app, database, owner);
  registerReviewRoutes(app, database, owner);
  registerPracticeRoutes(app, database, owner, options.speech);
  if (options.exampleSentencesEnabled === true)
    registerExampleRoutes(app, database, owner, options.examples);
  done();
};
