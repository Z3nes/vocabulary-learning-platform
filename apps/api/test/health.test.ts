import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { fakeDbHealth, testConfig } from './helpers.js';

// UNIT tests: the database checker is MOCKED (no PostgreSQL connection is made).
describe('health routes (mocked database)', () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it('GET /api/health reports liveness without touching the database', async () => {
    const db = fakeDbHealth('unreachable');
    app = await buildApp({ config: testConfig(), dbHealth: db, logger: false });

    const res = await app.inject({ method: 'GET', url: '/api/health' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
    expect(res.headers['cache-control']).toBe('no-store');
    expect(db.calls).toBe(0);
  });

  it('GET /api/health/db returns 200 when the database is reachable', async () => {
    app = await buildApp({
      config: testConfig(),
      dbHealth: fakeDbHealth('reachable'),
      logger: false,
    });

    const res = await app.inject({ method: 'GET', url: '/api/health/db' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok', database: 'reachable' });
  });

  it.each(['unreachable', 'not_configured'] as const)(
    'GET /api/health/db returns 503 when the database is %s',
    async (status) => {
      app = await buildApp({ config: testConfig(), dbHealth: fakeDbHealth(status), logger: false });

      const res = await app.inject({ method: 'GET', url: '/api/health/db' });

      expect(res.statusCode).toBe(503);
      expect(res.json()).toEqual({ status: 'error', database: status });
    },
  );

  it('honours a custom API prefix', async () => {
    app = await buildApp({
      config: testConfig({ apiPrefix: '/kelime/api' }),
      dbHealth: fakeDbHealth('reachable'),
      logger: false,
    });

    expect((await app.inject({ method: 'GET', url: '/kelime/api/health' })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/api/health' })).statusCode).toBe(404);
  });
});
