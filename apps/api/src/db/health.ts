import pg from 'pg';

export type DbHealthStatus = 'reachable' | 'unreachable' | 'not_configured';

export interface DbHealthChecker {
  check(): Promise<DbHealthStatus>;
  close(): Promise<void>;
}

export interface PgHealthCheckerOptions {
  connectionString: string | undefined;
  /** Upper bound for connecting and for the probe query. */
  timeoutMs?: number;
  /** Receives connection/query failures for server-side logging. */
  onError?: (error: unknown) => void;
}

/**
 * Database connectivity probe backed by a small, lazily created `pg` pool.
 * This independent probe stays available even before application migrations.
 */
export function createPgHealthChecker(options: PgHealthCheckerOptions): DbHealthChecker {
  const { connectionString, timeoutMs = 2000, onError } = options;
  let pool: pg.Pool | undefined;

  function getPool(url: string): pg.Pool {
    if (!pool) {
      pool = new pg.Pool({
        connectionString: url,
        max: 2,
        connectionTimeoutMillis: timeoutMs,
        query_timeout: timeoutMs,
        idleTimeoutMillis: 10_000,
      });
      // Errors on idle clients must not crash the process.
      pool.on('error', (error) => onError?.(error));
    }
    return pool;
  }

  return {
    async check() {
      if (!connectionString) return 'not_configured';
      try {
        await getPool(connectionString).query('SELECT 1');
        return 'reachable';
      } catch (error) {
        onError?.(error);
        return 'unreachable';
      }
    },
    async close() {
      const current = pool;
      pool = undefined;
      await current?.end();
    },
  };
}
