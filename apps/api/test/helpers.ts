import type { AppConfig } from '../src/config/env.js';
import type { DbHealthChecker, DbHealthStatus } from '../src/db/health.js';

export function testConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    host: '127.0.0.1',
    port: 0,
    apiPrefix: '/api',
    logLevel: 'silent',
    databaseUrl: undefined,
    nodeEnv: 'test',
    authMode: undefined,
    ...overrides,
  };
}

/** MOCK: a fake database checker that never opens a connection. */
export function fakeDbHealth(status: DbHealthStatus): DbHealthChecker & { calls: number } {
  const fake = {
    calls: 0,
    check() {
      fake.calls += 1;
      return Promise.resolve(status);
    },
    close() {
      return Promise.resolve();
    },
  };
  return fake;
}
