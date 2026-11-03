import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { testConfig } from './helpers.js';

// No database connection or external service is used by these fail-closed probes.
const id = '10000000-0000-4000-8000-000000000001';
const cases = [
  ['GET', '/lists'],
  ['POST', '/lists'],
  ['GET', `/lists/${id}`],
  ['PATCH', `/lists/${id}`],
  ['DELETE', `/lists/${id}`],
  ['GET', `/lists/${id}/words`],
  ['POST', `/lists/${id}/words/preview`],
  ['POST', `/lists/${id}/words/commit`],
  ['PATCH', `/lists/${id}/words/${id}`],
  ['DELETE', `/lists/${id}/words/${id}`],
  ['GET', `/study-sessions/${id}`],
  ['POST', `/study-sessions/${id}/actions`],
  ['POST', `/study-sessions/${id}/end`],
  ['GET', '/review'],
  ['POST', '/review/study-sessions'],
  ['GET', '/activity'],
  ['POST', '/games/completions'],
  ['GET', `/practice/${id}`],
  ['POST', `/practice/${id}/answers`],
  ['POST', `/practice/${id}/complete`],
  ['POST', `/practice/${id}/cancel`],
  ['POST', `/practice/${id}/skip-audio`],
  ['POST', `/practice/${id}/questions/${id}/audio`],
  ['GET', '/mixed'],
  ['POST', '/mixed'],
  ['POST', `/practice/${id}/reveal`],
  ['POST', `/practice/${id}/choice`],
  ['POST', `/practice/${id}/self-evaluation`],
  ['GET', '/puzzles/active?gameType=crossword'],
  ['GET', `/puzzles/${id}`],
  ['POST', `/puzzles/${id}/moves`],
  ['POST', `/puzzles/${id}/complete`],
  ['POST', `/puzzles/${id}/cancel`],
] as const;
describe('Session 11 production authentication and cross-origin boundary', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp({ config: testConfig({ nodeEnv: 'production' }), logger: false });
  });
  afterAll(async () => {
    await app.close();
  });
  it.each(cases)(
    'denies %s %s without an installed production identity provider',
    async (method, path) => {
      const response = await app.inject({
        method,
        url: `/api${path}`,
        headers: {
          'x-user-id': id,
          authorization: 'Bearer synthetic-invalid',
          cookie: `userId=${id}`,
          origin: 'https://untrusted.invalid',
        },
        ...(['POST', 'PATCH'].includes(method) ? { payload: {} } : {}),
      });
      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({ error: { code: 'UNAUTHENTICATED' } });
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.headers['access-control-allow-origin']).toBeUndefined();
    },
  );
  it('does not grant cross-origin JSON or DELETE preflight permission', async () => {
    for (const method of ['POST', 'DELETE']) {
      const response = await app.inject({
        method: 'OPTIONS',
        url: '/api/lists',
        headers: {
          origin: 'https://untrusted.invalid',
          'access-control-request-method': method,
          'access-control-request-headers': 'content-type',
        },
      });
      expect(response.headers['access-control-allow-origin']).toBeUndefined();
      expect(response.headers['access-control-allow-credentials']).toBeUndefined();
    }
  });
});
