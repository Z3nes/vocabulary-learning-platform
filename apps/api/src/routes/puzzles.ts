import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '../generated/prisma/client.js';
import { ApplicationError } from '../http/errors.js';
import { studyPercentages } from '../study/selection.js';
import {
  activePuzzles,
  finishPuzzle,
  getPuzzle,
  movePuzzle,
  puzzleSetup,
  startPuzzle,
} from '../puzzles/service.js';

const type = z.enum(['word-search', 'crossword']);
const list = z.object({ listId: z.uuid() }).strict();
const session = z.object({ sessionId: z.uuid() }).strict();
const base = z.object({ commandId: z.uuid(), version: z.int().min(0), board: z.int().min(0) });
export const moveSchema = z.discriminatedUnion('action', [
  base
    .extend({
      action: z.literal('select'),
      start: z.int().min(0).max(399),
      end: z.int().min(0).max(399),
    })
    .strict(),
  base
    .extend({
      action: z.literal('draft'),
      values: z.array(z.string().regex(/^[A-Za-z]?$/)).max(400),
    })
    .strict(),
  base.extend({ action: z.literal('check'), entryId: z.uuid() }).strict(),
]);
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new ApplicationError(400, 'VALIDATION_FAILED');
  return result.data;
}
export function registerPuzzleRoutes(
  app: FastifyInstance,
  database: () => PrismaClient,
  owner: (r: object) => string,
) {
  app.get('/puzzles/active', async (r) => ({
    sessions: await activePuzzles(
      database(),
      owner(r),
      parse(z.object({ gameType: type }).strict(), r.query).gameType,
    ),
  }));
  app.get('/lists/:listId/puzzles', async (r) =>
    puzzleSetup(
      database(),
      owner(r),
      parse(list, r.params).listId,
      parse(z.object({ gameType: type }).strict(), r.query).gameType,
    ),
  );
  app.post('/lists/:listId/puzzles', async (r, reply) => {
    const input = parse(
      z.object({ gameType: type, percentage: z.literal(studyPercentages) }).strict(),
      r.body,
    );
    return reply.code(201).send({
      session: await startPuzzle(
        database(),
        owner(r),
        parse(list, r.params).listId,
        input.gameType,
        input.percentage,
      ),
    });
  });
  app.get('/puzzles/:sessionId', async (r) => ({
    session: await getPuzzle(database(), owner(r), parse(session, r.params).sessionId),
  }));
  app.post('/puzzles/:sessionId/moves', { bodyLimit: 16384 }, async (r) =>
    movePuzzle(database(), owner(r), parse(session, r.params).sessionId, parse(moveSchema, r.body)),
  );
  for (const action of ['complete', 'cancel'] as const)
    app.post(`/puzzles/:sessionId/${action}`, async (r) => {
      parse(z.object({}).strict(), r.body);
      return finishPuzzle(
        database(),
        owner(r),
        parse(session, r.params).sessionId,
        action === 'cancel',
      );
    });
}
