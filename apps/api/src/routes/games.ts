import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '../generated/prisma/client.js';
import { ApplicationError } from '../http/errors.js';
import { completionSchema } from '../games/input.js';
import { completeGame } from '../games/service.js';

export function registerGameRoutes(
  app: FastifyInstance,
  database: () => PrismaClient,
  owner: (request: object) => string,
) {
  app.post('/games/completions', { bodyLimit: 262144 }, async (request) => {
    const result = completionSchema.safeParse(request.body);
    if (!result.success) throw new ApplicationError(400, 'VALIDATION_FAILED');
    return completeGame(database(), owner(request), result.data);
  });
}
