import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config/env.js';
import { developmentIdentityProvider } from '../src/auth/identity.js';
import { testConfig } from './helpers.js';

describe('authentication configuration', () => {
  let app: FastifyInstance | undefined;
  afterEach(async () => {
    await app?.close();
  });
  it('rejects dev auth in production at config and app boundaries', async () => {
    expect(() => loadConfig({ NODE_ENV: 'production', AUTH_MODE: 'dev' })).toThrow();
    await expect(
      buildApp({ config: testConfig({ nodeEnv: 'production', authMode: 'dev' }) }),
    ).rejects.toThrow();
  });
  it('does not enable dev auth implicitly or accept client identity claims', async () => {
    app = await buildApp({ config: testConfig(), logger: false });
    for (const url of [
      '/api/lists',
      '/api/lists?userId=someone-else',
      '/api/lists/e542713d-a716-401f-8986-f6437921ed14/words',
    ]) {
      const response = await app.inject({
        url,
        headers: { 'x-user-id': 'someone-else', cookie: 'userId=someone-else' },
      });
      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({ error: { code: 'UNAUTHENTICATED' } });
    }
  });
  it('rejects an unavailable injected provider', async () => {
    app = await buildApp({
      config: testConfig(),
      logger: false,
      identityProvider: { resolve: () => Promise.resolve(null) },
    });
    expect((await app.inject('/api/lists')).statusCode).toBe(401);
  });
  it('forbids injected identity adapters outside isolated tests', async () => {
    await expect(
      buildApp({
        config: testConfig({ nodeEnv: 'development' }),
        identityProvider: { resolve: () => Promise.resolve(null) },
      }),
    ).rejects.toThrow();
  });
  it('fails safely when the runtime database is missing despite dev auth', async () => {
    app = await buildApp({ config: testConfig({ authMode: 'dev' }), logger: false });
    const response = await app.inject('/api/lists');
    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ error: { code: 'INTERNAL_ERROR' } });
  });
  it('keeps the dev identity fixed despite frontend identity claims', async () => {
    // The adapter ignores request data entirely; exercise it through a test route.
    app = await buildApp({ config: testConfig(), logger: false });
    app.get('/test-identity', async (request) => developmentIdentityProvider.resolve(request));
    const res = await app.inject({
      url: '/test-identity?userId=forged',
      headers: { 'x-user-id': 'forged' },
    });
    expect(res.json()).toEqual({ provider: 'dev', subject: 'dev-user' });
  });
  it('hides failures from the identity adapter', async () => {
    app = await buildApp({
      config: testConfig(),
      logger: false,
      identityProvider: {
        resolve: () => Promise.reject(new Error('sensitive-internal-detail')),
      },
    });
    const res = await app.inject('/api/lists');
    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({ error: { code: 'INTERNAL_ERROR' } });
    expect(res.body).not.toContain('sensitive-internal-detail');
  });
});
