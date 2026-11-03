import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseEnv } from 'node:util';
import { createDevelopmentRunner, developmentProcesses } from './dev-processes.js';
import { startDevelopment } from './dev.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const api = join(root, 'apps/api');
const environmentFile = join(root, '.env.docker');
export class LocalSetupError extends Error {}

const prismaFailures = {
  P1000: 'Database authentication failed; check the original local credentials.',
  P1001: 'Database connection failed; check the Docker port and availability.',
  P1002: 'Database connection timed out.',
  P1003: 'The configured database does not exist.',
  P1010: 'The migration role lacks database or schema access.',
  P1011: 'Database TLS connection failed.',
  P1012: 'Prisma schema or configuration validation failed.',
  P1013: 'The database connection string is invalid.',
  P1017: 'The database server closed the connection.',
  P3005: 'The database is not empty and has no migration baseline; do not reset it.',
  P3009: 'An unfinished migration blocks deployment; inspect its history before recovery.',
  P3015: 'A committed migration file could not be read.',
  P3018: 'Migration SQL failed; inspect the named migration and SQLSTATE before recovery.',
};
const processFailures = {
  ENOENT: 'An executable was not found; check installed tools and reopen PowerShell.',
  EPERM: 'Process startup or access was denied; restricted sandboxes may block child processes.',
  EACCES: 'Process or Docker socket access was denied.',
  ETIMEDOUT: 'The command timed out.',
  ENOBUFS: 'Captured command output exceeded its buffer limit.',
};

/** Extract allowlisted evidence, never raw output, URLs, error messages or environment values. */
export function commandFailureDetails(result, config) {
  let output = [result.stdout, result.stderr]
    .filter((value) => typeof value === 'string')
    .join('\n');
  for (const secret of [config.migratorPassword, config.appPassword])
    output = output.replaceAll(secret, '[REDACTED]');
  const details = [];
  if (Number.isInteger(result.status)) details.push(`Exit status: ${result.status}.`);
  if (['SIGINT', 'SIGTERM', 'SIGKILL', 'SIGABRT'].includes(result.signal))
    details.push(`Signal: ${result.signal}.`);
  const processCodes = new Set([
    result.error?.code,
    ...[
      ...output.matchAll(/\b(?:spawn(?:Sync)?|with) (ENOENT|EPERM|EACCES|ETIMEDOUT|ENOBUFS)\b/gu),
    ].map((match) => match[1]),
  ]);
  for (const code of processCodes)
    if (Object.hasOwn(processFailures, code)) details.push(`${code}: ${processFailures[code]}`);
  for (const code of new Set(output.match(/\bP\d{4}\b/gu) ?? []))
    details.push(`Prisma ${code}${prismaFailures[code] ? `: ${prismaFailures[code]}` : '.'}`);
  for (const match of output.matchAll(/\bDatabase error code:\s*([A-Z0-9]{5})\b/gu))
    details.push(`PostgreSQL SQLSTATE: ${match[1]}.`);
  const migration = output.match(/\bMigration name:\s*([A-Za-z0-9_]+)\b/u)?.[1];
  if (migration && readdirSync(join(api, 'prisma/migrations')).includes(migration))
    details.push(`Migration: ${migration}.`);
  if (/permission denied while trying to connect to the docker API/iu.test(output))
    details.push('Docker socket access was denied.');
  return details.join(' ');
}

const keys = [
  'LOCAL_COMPOSE_PROJECT',
  'LOCAL_POSTGRES_PORT',
  'LOCAL_API_PORT',
  'LOCAL_WEB_PORT',
  'LOCAL_MIGRATOR_PASSWORD',
  'LOCAL_APP_PASSWORD',
];

export function parseLocalConfig(source) {
  const env = parseEnv(source);
  if (Object.keys(env).some((key) => !keys.includes(key)))
    throw new LocalSetupError('Only the documented LOCAL_* settings are allowed in .env.docker.');
  const project = env.LOCAL_COMPOSE_PROJECT ?? 'vocabulary-local';
  if (!/^vocabulary-local(?:-[a-z0-9]+)*$/u.test(project) || project.length > 50)
    throw new LocalSetupError(
      'LOCAL_COMPOSE_PROJECT must be vocabulary-local or vocabulary-local-<suffix>.',
    );
  const ports = ['LOCAL_POSTGRES_PORT', 'LOCAL_API_PORT', 'LOCAL_WEB_PORT'].map((key, index) => {
    const value = env[key] ?? ['5433', '3000', '5173'][index];
    if (
      !/^\d+$/u.test(value) ||
      Number(value) < 1024 ||
      Number(value) > 65535 ||
      Number(value) === 5432
    )
      throw new LocalSetupError(`${key} must be an unprivileged port other than 5432.`);
    return Number(value);
  });
  if (new Set(ports).size !== ports.length)
    throw new LocalSetupError('The three local ports must differ.');
  for (const key of ['LOCAL_MIGRATOR_PASSWORD', 'LOCAL_APP_PASSWORD']) {
    if (!/^[A-Za-z0-9_-]{24,128}$/u.test(env[key] ?? '') || env[key].startsWith('REPLACE_'))
      throw new LocalSetupError(
        `${key} needs a private random 24-128 character password; see .env.docker.example.`,
      );
  }
  if (env.LOCAL_MIGRATOR_PASSWORD === env.LOCAL_APP_PASSWORD)
    throw new LocalSetupError('Use different local application and migration passwords.');
  return {
    project,
    postgresPort: ports[0],
    apiPort: ports[1],
    webPort: ports[2],
    migratorPassword: env.LOCAL_MIGRATOR_PASSWORD,
    appPassword: env.LOCAL_APP_PASSWORD,
  };
}

export function readLocalConfig(create = false) {
  if (create) {
    const template = readFileSync(join(root, '.env.docker.example'), 'utf8');
    const content = template
      .replace('=REPLACE_MIGRATOR_PASSWORD', `=${randomBytes(32).toString('hex')}`)
      .replace('=REPLACE_APP_PASSWORD', `=${randomBytes(32).toString('hex')}`);
    try {
      writeFileSync(environmentFile, content, { flag: 'wx', mode: 0o600 });
      console.log('[local] Created private .env.docker. Existing .env files were not touched.');
    } catch (error) {
      if (error.code !== 'EEXIST')
        throw new LocalSetupError('Unable to create .env.docker. Check file permissions.');
    }
  }
  let source;
  try {
    source = readFileSync(environmentFile, 'utf8');
  } catch {
    throw new LocalSetupError('Missing/unreadable .env.docker. Run npm run local:setup first.');
  }
  return parseLocalConfig(source);
}

/** Build all targets from local settings, never from an existing URL or .env file. */
export function databaseEnvironment(config, inherited = process.env) {
  const url = (role, password, database) =>
    `postgresql://${role}:${encodeURIComponent(password)}@127.0.0.1:${config.postgresPort}/${database}`;
  const appUrl = url('vocabulary_local_app', config.appPassword, 'vocabulary_local');
  const migrationUrl = url(
    'vocabulary_local_migrator',
    config.migratorPassword,
    'vocabulary_local',
  );
  return {
    ...inherited,
    DATABASE_URL: appUrl,
    MIGRATION_DATABASE_URL: migrationUrl,
    SHADOW_DATABASE_URL: '', // Mask .env; prisma.config.ts omits the unused shadow URL.
    TEST_DATABASE_URL: `${appUrl}_test`,
    TEST_MIGRATION_DATABASE_URL: `${migrationUrl}_test`,
    NODE_ENV: 'development',
    AUTH_MODE: 'dev',
    HOST: '127.0.0.1',
    PORT: String(config.apiPort),
    API_PREFIX: '/api',
    LOG_LEVEL: 'info',
    EXAMPLE_SENTENCES_ENABLED: 'false',
    AZURE_SPEECH_ENABLED: 'false',
    AZURE_SPEECH_KEY: '',
    AZURE_SPEECH_REGION: '',
    AZURE_SPEECH_VOICE: '',
    AZURE_SPEECH_FORMAT: '',
    AZURE_SPEECH_CACHE_ENABLED: 'false',
  };
}

export function localDevelopment(config, env) {
  const apiEnv = {
    ...env,
    MIGRATION_DATABASE_URL: '',
    SHADOW_DATABASE_URL: '',
    TEST_DATABASE_URL: '',
    TEST_MIGRATION_DATABASE_URL: '',
  };
  const webEnv = {
    ...apiEnv,
    DATABASE_URL: '',
    DEV_API_TARGET: `http://127.0.0.1:${config.apiPort}`,
    DEV_API_PREFIX: '/api',
    VITE_BASE_PATH: '/',
    VITE_API_BASE_PATH: '/api',
  };
  return {
    apiEnv,
    webEnv,
    processes: {
      api: {
        ...developmentProcesses.api,
        args: developmentProcesses.api.args.filter((arg) => !arg.startsWith('--env-file')),
      },
      web: {
        ...developmentProcesses.web,
        args: [...developmentProcesses.web.args, '--port', String(config.webPort), '--strictPort'],
      },
    },
  };
}

/** Fail closed before any host database connection if Docker does not own the target. */
export function validateContainer(container, config) {
  const labels = container.Config?.Labels ?? {};
  const env = new Set(container.Config?.Env ?? []);
  const ports = container.NetworkSettings?.Ports?.['5432/tcp'];
  const volume = container.Mounts?.find((mount) => mount.Destination === '/var/lib/postgresql');
  if (
    labels['com.docker.compose.project'] !== config.project ||
    labels['com.docker.compose.service'] !== 'postgres' ||
    labels['org.vocabulary.local-database'] !== 'onboarding-v1' ||
    container.Config?.Image !== 'postgres:18.6' ||
    !container.State?.Running ||
    container.State?.Health?.Status !== 'healthy' ||
    ports?.length !== 1 ||
    ports[0].HostIp !== '127.0.0.1' ||
    ports[0].HostPort !== String(config.postgresPort) ||
    volume?.Type !== 'volume' ||
    volume.Name !== `${config.project}_postgres-data` ||
    !env.has('POSTGRES_DB=vocabulary_local') ||
    !env.has('POSTGRES_USER=vocabulary_local_migrator') ||
    !env.has(`POSTGRES_PASSWORD=${config.migratorPassword}`) ||
    !env.has(`LOCAL_APP_PASSWORD=${config.appPassword}`)
  )
    throw new LocalSetupError(
      'Docker database identity/health/port/volume/credentials do not match. No migrations were started.',
    );
}

export function createLocalTools(config, run = spawnSync, inherited = process.env) {
  const env = databaseEnvironment(config, inherited);
  const dockerEnv = {
    ...inherited,
    ...Object.fromEntries(keys.map((key) => [key, ''])),
    LOCAL_COMPOSE_PROJECT: config.project,
    LOCAL_POSTGRES_PORT: String(config.postgresPort),
    LOCAL_MIGRATOR_PASSWORD: config.migratorPassword,
    LOCAL_APP_PASSWORD: config.appPassword,
    COMPOSE_DISABLE_ENV_FILE: '1',
  };
  function command(file, args, message, options = {}) {
    const result = run(file, args, {
      cwd: root,
      env: dockerEnv,
      encoding: 'utf8',
      stdio: 'pipe',
      windowsHide: true,
      timeout: 180_000,
      maxBuffer: 4 * 1024 * 1024,
      ...options,
    });
    // Raw output and spawn errors may contain credentials; expose only allowlisted evidence.
    if (result.error || result.status !== 0)
      throw new LocalSetupError(
        [message, commandFailureDetails(result, config)].filter(Boolean).join(' '),
      );
    return result.stdout?.trim() ?? '';
  }
  const docker = (args, message) => command('docker', args, message);
  const compose = (args) =>
    docker(
      [
        'compose',
        '--project-name',
        config.project,
        '--file',
        join(root, 'compose.local.yml'),
        '--env-file',
        environmentFile,
        ...args,
      ],
      'Docker Compose failed. Check Docker Desktop, image download, the configured port, and docs/LOCAL_DEVELOPMENT.md.',
    );

  function checkDocker() {
    const endpoint =
      (!inherited.DOCKER_CONTEXT && inherited.DOCKER_HOST) ||
      JSON.parse(
        docker(
          ['context', 'inspect', '--format', '{{json .Endpoints.docker.Host}}'],
          'Docker is unavailable. Install/start Docker Desktop with Linux containers and reopen PowerShell.',
        ),
      );
    if (!/^(?:npipe|unix):\/\//u.test(endpoint))
      throw new LocalSetupError(
        'Local setup requires a local Docker socket/named pipe; remote Docker contexts are refused.',
      );
    const os = docker(
      ['version', '--format', '{{.Server.Os}}'],
      'Docker engine is unavailable. Start Docker Desktop with Linux containers.',
    );
    if (os !== 'linux') throw new LocalSetupError('Switch Docker Desktop to Linux containers.');
    const version = compose(['version', '--short']).match(/^v?(\d+)\.(\d+)/u);
    if (!version || Number(version[1]) < 2 || (Number(version[1]) === 2 && Number(version[2]) < 20))
      throw new LocalSetupError(
        'Docker Compose v2.20 or newer is required. Update Docker Desktop.',
      );
  }
  function inspectDatabase() {
    const id = compose(['ps', '--quiet', 'postgres']);
    if (!/^[a-f0-9]{12,64}$/u.test(id))
      throw new LocalSetupError('Local PostgreSQL is not running. Run npm run local:setup.');
    const [container] = JSON.parse(
      docker(['inspect', id], 'Unable to inspect the local PostgreSQL container.'),
    );
    validateContainer(container, config);
    return id;
  }
  function prisma(args, targetEnv = env) {
    const require = createRequire(join(api, 'package.json'));
    command(
      process.execPath,
      [require.resolve('prisma/build/index.js'), ...args],
      `Prisma ${args.join(' ')} failed. Check local database health and the migration troubleshooting guide.`,
      { cwd: api, env: targetEnv },
    );
  }
  function verifySchema(id, database = 'vocabulary_local') {
    if (!['vocabulary_local', 'vocabulary_local_test'].includes(database))
      throw new LocalSetupError('Unsupported local database.');
    const sql = `SELECT json_build_object(
      'migrations', (SELECT json_agg(migration_name ORDER BY migration_name) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL),
      'unfinished', (SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NULL AND rolled_back_at IS NULL),
      'tables', (SELECT json_agg(tablename) FROM pg_tables WHERE schemaname = 'public'));`;
    const schema = JSON.parse(
      docker(
        [
          'exec',
          id,
          'psql',
          '--no-psqlrc',
          '--username',
          'vocabulary_local_migrator',
          '--dbname',
          database,
          '--tuples-only',
          '--no-align',
          '--set',
          'ON_ERROR_STOP=1',
          '--command',
          sql,
        ],
        'Local schema verification failed. Rerun local:setup; never reset a database.',
      ),
    );
    const migrations = readdirSync(join(api, 'prisma/migrations'), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    const models = [
      ...readFileSync(join(api, 'prisma/schema.prisma'), 'utf8').matchAll(/^model (\w+) \{/gmu),
    ].map((match) => match[1]);
    if (
      schema.unfinished !== 0 ||
      JSON.stringify(schema.migrations) !== JSON.stringify(migrations) ||
      models.some((model) => !schema.tables?.includes(model))
    )
      throw new LocalSetupError(
        'The local schema does not match the committed migrations. Inspect the failure; do not reset.',
      );
    console.log(
      `[local] ${database}: ${migrations.length} migrations and ${models.length} model tables verified.`,
    );
  }
  return { env, checkDocker, compose, inspectDatabase, prisma, verifySchema, command };
}

export async function runLocal(action, config, tools = createLocalTools(config)) {
  if (!['setup', 'dev', 'stop', 'test'].includes(action))
    throw new LocalSetupError('Use local:setup, local:dev, local:stop or local:test:integration.');
  tools.checkDocker();
  if (action === 'setup') {
    console.log(
      '[local] Starting isolated PostgreSQL (first image download can take a few minutes).',
    );
    tools.compose([
      'up',
      '--detach',
      '--no-recreate',
      '--wait',
      '--wait-timeout',
      '90',
      'postgres',
    ]);
  }
  const id = tools.inspectDatabase();
  if (action === 'setup') {
    tools.prisma(['generate']);
    tools.prisma(['migrate', 'deploy']);
    tools.verifySchema(id);
    console.log('[local] Prisma Client generated; local database ready. Run npm run local:dev.');
  } else if (action === 'stop') {
    tools.compose(['stop', 'postgres']);
    console.log('[local] PostgreSQL stopped. Its named volume and data are preserved.');
  } else if (action === 'test') {
    tools.command(
      process.execPath,
      ['--import', 'tsx', 'test/migrate.ts'],
      'Dedicated Docker test database safety/migration failed. See docs/LOCAL_DEVELOPMENT.md.',
      { cwd: api, env: tools.env },
    );
    tools.verifySchema(id, 'vocabulary_local_test');
    tools.command(
      process.execPath,
      [
        join(dirname(fileURLToPath(import.meta.resolve('vitest/package.json'))), 'vitest.mjs'),
        'run',
        '--project',
        'integration',
        '--configLoader',
        'native',
        '--pool',
        'threads',
        '--no-file-parallelism',
      ],
      'Docker integration tests failed. Check the test output above.',
      { cwd: api, env: tools.env, stdio: 'inherit', timeout: 600_000 },
    );
  } else if (action === 'dev') {
    tools.verifySchema(id);
    const { apiEnv, webEnv, processes } = localDevelopment(config, tools.env);
    const runner = createDevelopmentRunner({ processes });
    console.log(`[local] Local demo identity only. Web: http://127.0.0.1:${config.webPort}/`);
    const session = startDevelopment({
      run: (commands, options) =>
        runner(
          commands.map((command) => ({
            ...command,
            env: { ...(command.name === 'api' ? apiEnv : webEnv), ...command.env },
          })),
          options,
        ),
    });
    return await session.result;
  }
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (Number(process.versions.node.split('.')[0]) !== 24)
      throw new LocalSetupError('Use Node.js 24 LTS (see .nvmrc).');
    const action = process.argv[2];
    if (!['setup', 'dev', 'stop', 'test'].includes(action) || process.argv.length !== 3)
      throw new LocalSetupError(
        'Use local:setup, local:dev, local:stop or local:test:integration without extra arguments.',
      );
    process.exitCode = await runLocal(action, readLocalConfig(action === 'setup'));
  } catch (error) {
    // Only our controlled messages are printable. Unexpected parser/driver errors stay private.
    console.error(
      `[local] ${error instanceof LocalSetupError ? error.message : 'Local setup failed. Check dependencies/configuration; private error details were suppressed.'}`,
    );
    process.exitCode = 1;
  }
}
