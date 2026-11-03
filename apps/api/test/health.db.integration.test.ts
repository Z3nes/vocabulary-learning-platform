import { afterAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config/env.js';
import { loadLocalEnvironment, verifyTestDatabase } from './databaseSafety.js';

loadLocalEnvironment();
const targets = await verifyTestDatabase();
const config = loadConfig({
  ...process.env,
  DATABASE_URL: targets.runtime,
  NODE_ENV: 'test',
  AUTH_MODE: 'dev',
  LOG_LEVEL: 'silent',
});

describe('GET /api/health/db (real PostgreSQL)', () => {
  const appPromise = buildApp({ config, logger: false });

  afterAll(async () => {
    await (await appPromise).close();
  });

  it('reports the database as reachable', async () => {
    const app = await appPromise;
    const prefix = config.apiPrefix === '/' ? '' : config.apiPrefix;
    const res = await app.inject({ method: 'GET', url: `${prefix}/health/db` });
    expect(res.json()).toEqual({ status: 'ok', database: 'reachable' });
    expect(res.statusCode).toBe(200);
  });
});
