import pg from 'pg';

// Test tooling only: not part of the API production build.

export function loadLocalEnvironment(): void {
  try {
    process.loadEnvFile('.env');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
      // eslint-disable-next-line preserve-caught-error -- Environment parser errors may contain secrets.
      throw new Error('Unable to load local environment');
  }
}

interface DatabaseIdentity {
  database: string;
  address: string;
  port: number;
}

function databaseName(value: string | undefined): string {
  try {
    if (!value) throw new Error();
    const url = new URL(value);
    // Reject driver parameters that could override the intended target.
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.search) throw new Error();
    const name = decodeURIComponent(url.pathname.slice(1));
    if (!name || name.includes('/')) throw new Error();
    return name;
  } catch {
    throw new Error('Database safety requires explicit PostgreSQL URLs without query parameters');
  }
}

export function validateTestTargets(env: NodeJS.ProcessEnv): {
  runtime: string;
  migration: string;
  development: string;
  name: string;
} {
  const name = databaseName(env['TEST_DATABASE_URL']);
  const migrationName = databaseName(env['TEST_MIGRATION_DATABASE_URL']);
  const developmentName = databaseName(env['DATABASE_URL']);
  if (!name.endsWith('_test') || name !== migrationName || name === developmentName) {
    throw new Error(
      'Unsafe test database targets: use the same dedicated *_test database, separate from development',
    );
  }
  return {
    runtime: env['TEST_DATABASE_URL']!,
    migration: env['TEST_MIGRATION_DATABASE_URL']!,
    development: env['DATABASE_URL']!,
    name,
  };
}

async function inspect(url: string): Promise<DatabaseIdentity> {
  const client = new pg.Client({
    connectionString: url,
    connectionTimeoutMillis: 5000,
    query_timeout: 5000,
  });
  try {
    await client.connect();
    const result = await client.query<DatabaseIdentity>(
      'SELECT current_database() AS database, inet_server_addr()::text AS address, inet_server_port() AS port',
    );
    const identity = result.rows[0];
    if (!identity?.address || !identity.port) throw new Error();
    return identity;
  } catch {
    throw new Error('Unable to establish real database identities; no test writes are permitted');
  } finally {
    await client.end();
  }
}

/** Read-only verification MUST finish before migrations, test writes or cleanup. */
export async function verifyTestDatabase(env: NodeJS.ProcessEnv = process.env) {
  const targets = validateTestTargets(env);
  const [runtime, migration, development] = await Promise.all([
    inspect(targets.runtime),
    inspect(targets.migration),
    inspect(targets.development),
  ]);
  const same = (a: DatabaseIdentity, b: DatabaseIdentity) =>
    a.database === b.database && a.address === b.address && a.port === b.port;
  if (
    runtime.database !== targets.name ||
    !runtime.database.endsWith('_test') ||
    !same(runtime, migration) ||
    same(runtime, development)
  ) {
    throw new Error('Resolved database identities failed the test safety checks');
  }
  return targets;
}
