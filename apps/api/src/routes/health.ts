import type { FastifyPluginCallback } from 'fastify';
import { z } from 'zod';
import type { DbHealthChecker } from '../db/health.js';

const liveSchema = z.object({ status: z.literal('ok') });
const dbSchema = z.object({
  status: z.enum(['ok', 'error']),
  database: z.enum(['reachable', 'unreachable', 'not_configured']),
});

export type LiveResponse = z.infer<typeof liveSchema>;
export type DbResponse = z.infer<typeof dbSchema>;

const toJsonSchema = (schema: z.ZodType) => z.toJSONSchema(schema, { target: 'draft-7' });

export interface HealthRoutesOptions {
  dbHealth: DbHealthChecker;
}

export const healthRoutes: FastifyPluginCallback<HealthRoutesOptions> = (
  app,
  { dbHealth },
  done,
) => {
  app.addHook('onSend', async (_request, reply) => {
    reply.header('cache-control', 'no-store');
  });

  // Process liveness only: never touches the database.
  app.get('/health', { schema: { response: { 200: toJsonSchema(liveSchema) } } }, () => {
    const body: LiveResponse = { status: 'ok' };
    return body;
  });

  app.get(
    '/health/db',
    { schema: { response: { 200: toJsonSchema(dbSchema), 503: toJsonSchema(dbSchema) } } },
    async (_request, reply) => {
      const database = await dbHealth.check();
      const body: DbResponse = { status: database === 'reachable' ? 'ok' : 'error', database };
      return reply.code(database === 'reachable' ? 200 : 503).send(body);
    },
  );

  done();
};
