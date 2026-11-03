import { describe, expect, it } from 'vitest';
import { createPgHealthChecker } from '../src/db/health.js';

// UNIT tests of the real `pg` checker WITHOUT a PostgreSQL server (no mocks, no database).
describe('createPgHealthChecker (no database server)', () => {
  it('reports not_configured when no connection string is set', async () => {
    const checker = createPgHealthChecker({ connectionString: undefined });
    expect(await checker.check()).toBe('not_configured');
    await checker.close();
  });

  it('reports unreachable and forwards the error when nothing listens on the port', async () => {
    const errors: unknown[] = [];
    const checker = createPgHealthChecker({
      // Port 1 on loopback has no listener; the credentials are dummies.
      connectionString: 'postgresql://nobody:nothing@127.0.0.1:1/none',
      timeoutMs: 1500,
      onError: (error) => errors.push(error),
    });
    expect(await checker.check()).toBe('unreachable');
    expect(errors.length).toBeGreaterThan(0);
    await checker.close();
  });
});
