import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';
import {
  commandFailureDetails,
  createLocalTools,
  databaseEnvironment,
  localDevelopment,
  LocalSetupError,
  parseLocalConfig,
  runLocal,
  validateContainer,
} from './local.js';

// Synthetic credentials only. No .env file or real database is read by these tests.
const settings = {
  LOCAL_COMPOSE_PROJECT: 'vocabulary-local-check',
  LOCAL_POSTGRES_PORT: '55433',
  LOCAL_API_PORT: '33000',
  LOCAL_WEB_PORT: '35173',
  LOCAL_MIGRATOR_PASSWORD: 'synthetic_migrator_password_123456',
  LOCAL_APP_PASSWORD: 'synthetic_runtime_password_654321',
};
const source = (values) =>
  Object.entries(values)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
const config = parseLocalConfig(source(settings));
const id = 'a'.repeat(64);
let prismaConfigImport = 0;

async function loadPrismaConfig(env) {
  const previous = process.env;
  process.env = { ...env };
  try {
    const url = new URL('../apps/api/prisma.config.ts', import.meta.url);
    url.searchParams.set('test', String(++prismaConfigImport));
    return (await import(url.href)).default;
  } finally {
    process.env = previous;
  }
}

function container() {
  return {
    Config: {
      Image: 'postgres:18.6',
      Labels: {
        'com.docker.compose.project': config.project,
        'com.docker.compose.service': 'postgres',
        'org.vocabulary.local-database': 'onboarding-v1',
      },
      Env: [
        'POSTGRES_DB=vocabulary_local',
        'POSTGRES_USER=vocabulary_local_migrator',
        `POSTGRES_PASSWORD=${config.migratorPassword}`,
        `LOCAL_APP_PASSWORD=${config.appPassword}`,
      ],
    },
    State: { Running: true, Health: { Status: 'healthy' } },
    NetworkSettings: {
      Ports: { '5432/tcp': [{ HostIp: '127.0.0.1', HostPort: String(config.postgresPort) }] },
    },
    Mounts: [
      {
        Type: 'volume',
        Name: `${config.project}_postgres-data`,
        Destination: '/var/lib/postgresql',
      },
    ],
  };
}

function dockerFixture(
  {
    inspect = container(),
    endpoint = 'npipe:////./pipe/dockerDesktopLinuxEngine',
    version = '2.20.0',
    failed = false,
    unfinished = 0,
    missingTable = false,
  } = {},
  inherited = {},
) {
  const calls = [];
  const run = (file, args, options) => {
    calls.push({ file, args, options });
    if (failed) return { status: 1, stderr: `private failure: ${config.migratorPassword}` };
    let stdout = '';
    if (args[0] === 'context') stdout = JSON.stringify(endpoint);
    else if (args[0] === 'version') stdout = 'linux';
    else if (args[0] === 'inspect') stdout = JSON.stringify([inspect]);
    else if (args.includes('version')) stdout = version;
    else if (args.includes('ps')) stdout = id;
    else if (args[0] === 'exec') {
      const migrations = readdirSync(new URL('../apps/api/prisma/migrations/', import.meta.url), {
        withFileTypes: true,
      })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort();
      const tables = [
        ...readFileSync(
          new URL('../apps/api/prisma/schema.prisma', import.meta.url),
          'utf8',
        ).matchAll(/^model (\w+) \{/gmu),
      ].map((match) => match[1]);
      stdout = JSON.stringify({
        migrations,
        unfinished,
        tables: missingTable ? tables.slice(1) : tables,
      });
    }
    return { status: 0, stdout };
  };
  return { calls, tools: createLocalTools(config, run, inherited) };
}

test('local targets cannot be redirected by inherited owner database URLs', () => {
  const owner = Object.fromEntries(
    [
      'DATABASE_URL',
      'MIGRATION_DATABASE_URL',
      'SHADOW_DATABASE_URL',
      'TEST_DATABASE_URL',
      'TEST_MIGRATION_DATABASE_URL',
    ].map((key) => [key, 'postgresql://owner:synthetic@127.0.0.1:5432/owner_database']),
  );
  const original = { ...owner };
  const env = databaseEnvironment(config, owner);
  for (const key of Object.keys(owner).filter((key) => key !== 'SHADOW_DATABASE_URL')) {
    const url = new URL(env[key]);
    assert.equal(url.hostname, '127.0.0.1');
    assert.equal(url.port, '55433');
    assert.equal(
      url.pathname,
      key.startsWith('TEST_') ? '/vocabulary_local_test' : '/vocabulary_local',
    );
    assert.equal(
      url.username,
      key.includes('MIGRATION') ? 'vocabulary_local_migrator' : 'vocabulary_local_app',
    );
  }
  assert.equal(env.SHADOW_DATABASE_URL, '');
  assert.equal(env.AUTH_MODE, 'dev');
  assert.deepEqual(owner, original);
});

test('local config parsing and credential encoding preserve URL components', () => {
  const quoted = Object.entries(settings)
    .map(([key, value]) => `  ${key} = "${value}" # synthetic setting`)
    .join('\r\n');
  assert.deepEqual(parseLocalConfig(quoted), config);

  // Exercise URL encoding independently of the stricter local password policy.
  const credentials = {
    ...config,
    migratorPassword: 'synthetic_migrator:/?#@% +\u0131',
    appPassword: 'synthetic_app:/?#@% +\u00fc',
  };
  const env = databaseEnvironment(credentials, {});
  for (const key of ['DATABASE_URL', 'MIGRATION_DATABASE_URL']) {
    const url = new URL(env[key]);
    assert.equal(url.hostname, '127.0.0.1');
    assert.equal(url.port, String(config.postgresPort));
    assert.equal(url.pathname, '/vocabulary_local');
    assert.equal(url.search, '');
    assert.equal(url.hash, '');
    assert.equal(
      decodeURIComponent(url.password),
      key === 'MIGRATION_DATABASE_URL' ? credentials.migratorPassword : credentials.appPassword,
    );
  }
});

test('Prisma reads the local child migration URL and omits blank shadow URLs', async (context) => {
  // Do not read the developer's apps/api/.env during config imports.
  context.mock.method(process, 'loadEnvFile', () => {});
  const owner = 'postgresql://owner:synthetic@127.0.0.1:5432/owner_database';
  const { calls, tools } = dockerFixture(
    {},
    {
      DATABASE_URL: owner,
      MIGRATION_DATABASE_URL: owner,
      SHADOW_DATABASE_URL: owner,
    },
  );
  tools.prisma(['migrate', 'deploy']);
  const childEnv = calls[0].options.env;
  assert.equal(childEnv.SHADOW_DATABASE_URL, '');
  for (const value of [undefined, '', ' \t ']) {
    const env = { ...childEnv };
    if (value === undefined) delete env.SHADOW_DATABASE_URL;
    else env.SHADOW_DATABASE_URL = value;
    const prisma = await loadPrismaConfig(env);
    assert.equal(prisma.datasource.url, tools.env.MIGRATION_DATABASE_URL);
    assert.notEqual(prisma.datasource.url, childEnv.DATABASE_URL);
    // An explicit empty URL causes native engine P1013 even in migrate deploy.
    assert.equal(Object.hasOwn(prisma.datasource, 'shadowDatabaseUrl'), false);
  }

  const shadow = `${tools.env.MIGRATION_DATABASE_URL}_shadow`;
  const configured = await loadPrismaConfig({ ...childEnv, SHADOW_DATABASE_URL: shadow });
  assert.equal(configured.datasource.shadowDatabaseUrl, shadow);
  for (const migration of [undefined, '']) {
    const env = { ...childEnv };
    if (migration === undefined) delete env.MIGRATION_DATABASE_URL;
    else env.MIGRATION_DATABASE_URL = migration;
    const prisma = await loadPrismaConfig(env);
    assert.equal(prisma.datasource.url, '');
  }
});

test('unsafe ports, arbitrary URLs/projects, missing passwords and placeholders fail closed', () => {
  const invalid = [
    { LOCAL_POSTGRES_PORT: '5432' },
    { LOCAL_API_PORT: '5432' },
    { LOCAL_POSTGRES_PORT: '55433/path' },
    { LOCAL_POSTGRES_PORT: '1023' },
    { LOCAL_POSTGRES_PORT: '65536' },
    { LOCAL_WEB_PORT: settings.LOCAL_API_PORT },
    { LOCAL_COMPOSE_PROJECT: 'web' },
    { LOCAL_COMPOSE_PROJECT: '../vocabulary-local' },
    { DATABASE_URL: 'postgresql://owner/owner_database' },
    { LOCAL_APP_PASSWORD: '' },
    { LOCAL_MIGRATOR_PASSWORD: 'REPLACE_MIGRATOR_PASSWORD' },
    { LOCAL_APP_PASSWORD: settings.LOCAL_MIGRATOR_PASSWORD },
  ];
  for (const change of invalid)
    assert.throws(() => parseLocalConfig(source({ ...settings, ...change })), LocalSetupError);
  assert.throws(
    () =>
      parseLocalConfig(readFileSync(new URL('../.env.docker.example', import.meta.url), 'utf8')),
    LocalSetupError,
  );
});

test('the local launcher withholds migration credentials from API and database URLs from Vite', () => {
  const env = databaseEnvironment(config, {
    DEV_API_TARGET: 'https://unrelated.example',
    VITE_BASE_PATH: '/old/',
  });
  const local = localDevelopment(config, env);
  assert.equal(local.apiEnv.DATABASE_URL, env.DATABASE_URL);
  for (const key of [
    'MIGRATION_DATABASE_URL',
    'SHADOW_DATABASE_URL',
    'TEST_DATABASE_URL',
    'TEST_MIGRATION_DATABASE_URL',
  ])
    assert.equal(local.apiEnv[key], '');
  assert.equal(local.webEnv.DATABASE_URL, '');
  assert.equal(local.webEnv.DEV_API_TARGET, 'http://127.0.0.1:33000');
  assert.equal(local.webEnv.DEV_API_PREFIX, '/api');
  assert.equal(local.webEnv.VITE_BASE_PATH, '/');
  assert.equal(local.webEnv.VITE_API_BASE_PATH, '/api');
  assert.equal(
    local.processes.api.args.some((arg) => arg.includes('--env-file')),
    false,
  );
  assert.deepEqual(local.processes.web.args.slice(-3), ['--port', '35173', '--strictPort']);
  assert.equal(env.DEV_API_TARGET, 'https://unrelated.example');
});

test('container ownership, loopback binding, volume and health are required before migrations', async () => {
  const changes = [
    (value) => {
      value.Config.Labels['com.docker.compose.project'] = 'web';
    },
    (value) => {
      value.Config.Labels['org.vocabulary.local-database'] = 'other';
    },
    (value) => {
      value.Config.Image = 'postgres:17';
    },
    (value) => {
      value.NetworkSettings.Ports['5432/tcp'][0].HostPort = '5432';
    },
    (value) => {
      value.NetworkSettings.Ports['5432/tcp'][0].HostIp = '0.0.0.0';
    },
    (value) => {
      value.Mounts[0].Name = 'existing-owner-volume';
    },
    (value) => {
      value.Mounts[0].Type = 'bind';
    },
    (value) => {
      value.State.Health.Status = 'unhealthy';
    },
    (value) => {
      value.Config.Env = [];
    },
  ];
  validateContainer(container(), config);
  for (const change of changes) {
    const value = container();
    change(value);
    const { calls, tools } = dockerFixture({ inspect: value });
    await assert.rejects(runLocal('setup', config, tools), /No migrations were started/u);
    assert.equal(
      calls.some((call) => call.file === process.execPath),
      false,
    );
  }
});

test('remote engines, including a context overriding DOCKER_HOST, are refused before compose starts', async () => {
  for (const [endpoint, inherited] of [
    ['ssh://remote.example', {}],
    [
      'tcp://remote.example:2376',
      { DOCKER_CONTEXT: 'remote', DOCKER_HOST: 'npipe:////./pipe/docker_engine' },
    ],
    ['unix:///var/run/docker.sock', { DOCKER_HOST: 'tcp://remote.example:2376' }],
  ]) {
    const { calls, tools } = dockerFixture({ endpoint }, inherited);
    await assert.rejects(runLocal('setup', config, tools), /remote Docker contexts are refused/u);
    assert.equal(
      calls.some((call) => call.args[0] === 'compose'),
      false,
    );
  }
});

test('missing Docker and old Compose fail with controlled errors without disclosing command output', async () => {
  const missing = dockerFixture({ failed: true });
  await assert.rejects(runLocal('setup', config, missing.tools), (error) => {
    assert.match(error.message, /Docker is unavailable/u);
    assert.equal(error.message.includes(config.migratorPassword), false);
    return true;
  });
  assert.equal(missing.calls.length, 1);
  const old = dockerFixture({ version: '2.19.1' });
  await assert.rejects(runLocal('setup', config, old.tools), /v2.20 or newer/u);
  assert.equal(
    old.calls.some((call) => call.args.includes('up')),
    false,
  );
});

test('command failures expose exit, spawn and Prisma engine codes without private output', () => {
  const privateUrl = `postgresql://vocabulary_local_migrator:${config.migratorPassword}@127.0.0.1:55433/vocabulary_local`;
  for (const result of [
    { status: null, error: { code: 'EPERM', message: privateUrl } },
    {
      status: 1,
      stderr: `Schema engine exited. Command failed with EPERM: engine --datasource ${privateUrl}\nspawn EPERM`,
    },
  ]) {
    const message = commandFailureDetails(result, config);
    assert.match(message, /EPERM: Process startup or access was denied/u);
    assert.equal(message.includes(config.migratorPassword), false);
    assert.equal(message.includes('postgresql://'), false);
  }
  const { tools } = dockerFixture();
  const failed = createLocalTools(
    config,
    () => ({
      status: 1,
      stderr: `Error: P1013\n${privateUrl}\nLOCAL_APP_PASSWORD=${config.appPassword}`,
    }),
    tools.env,
  );
  assert.throws(
    () => failed.prisma(['migrate', 'deploy']),
    (error) => {
      assert.ok(error instanceof LocalSetupError);
      assert.match(error.message, /Prisma migrate deploy failed/u);
      assert.match(error.message, /Exit status: 1/u);
      assert.match(error.message, /Prisma P1013: The database connection string is invalid/u);
      assert.equal(error.message.includes(config.migratorPassword), false);
      assert.equal(error.message.includes(config.appPassword), false);
      assert.equal(error.message.includes('postgresql://'), false);
      return true;
    },
  );
});

test('migration diagnostics include only recognized codes and committed migration names', () => {
  const migration = '20261021000000_personal_lists';
  const result = {
    status: 1,
    stdout: 'Unknown secret/token and existing vocabulary content must stay private.',
    stderr: `Error: P3018\nMigration name: ${migration}\nDatabase error code: 42501\nFailing row: private record\npassword="${config.appPassword}"`,
  };
  assert.equal(
    commandFailureDetails(result, config),
    `Exit status: 1. Prisma P3018: ${'Migration SQL failed; inspect the named migration and SQLSTATE before recovery.'} PostgreSQL SQLSTATE: 42501. Migration: ${migration}.`,
  );
  assert.equal(
    commandFailureDetails({ status: 7, stderr: 'Migration name: private_record_name' }, config),
    'Exit status: 7.',
  );
  assert.equal(
    commandFailureDetails(
      { error: { code: 'private_error_code', message: 'private token' } },
      config,
    ),
    '',
  );
  const disguisedConfig = { ...config, appPassword: 'P1000_synthetic_private_password' };
  assert.equal(
    commandFailureDetails({ status: 1, stderr: disguisedConfig.appPassword }, disguisedConfig),
    'Exit status: 1.',
  );
});

test('setup generates Client, deploys existing migrations only after inspection, and verifies schema', async () => {
  const { calls, tools } = dockerFixture();
  assert.equal(await runLocal('setup', config, tools), 0);
  const nodeCalls = calls.filter((call) => call.file === process.execPath);
  assert.deepEqual(
    nodeCalls.map((call) => call.args.slice(1)),
    [['generate'], ['migrate', 'deploy']],
  );
  assert.ok(calls.findIndex((call) => call.args[0] === 'inspect') < calls.indexOf(nodeCalls[0]));
  assert.equal(nodeCalls[1].options.env.MIGRATION_DATABASE_URL, tools.env.MIGRATION_DATABASE_URL);
  const composeCalls = calls.filter((call) => call.args[0] === 'compose');
  for (const call of composeCalls) {
    assert.equal(call.args[2], config.project);
    assert.ok(call.args[4].endsWith('compose.local.yml'));
    assert.ok(call.args[6].endsWith('.env.docker'));
    assert.equal(call.options.env.LOCAL_POSTGRES_PORT, '55433');
  }
  assert.equal(
    calls.some((call) => call.args.some((arg) => ['reset', 'down', '-v', 'push'].includes(arg))),
    false,
  );
  assert.equal(calls.at(-1).args[0], 'exec');
});

test('incomplete migrations and missing application tables fail schema verification', () => {
  for (const options of [{ unfinished: 1 }, { missingTable: true }]) {
    const { tools } = dockerFixture(options);
    assert.throws(() => tools.verifySchema(id), /schema does not match/u);
  }
});

test('stop retains the named volume and never invokes Prisma or down', async () => {
  const { calls, tools } = dockerFixture();
  assert.equal(await runLocal('stop', config, tools), 0);
  assert.deepEqual(calls.at(-1).args.slice(-2), ['stop', 'postgres']);
  assert.equal(
    calls.some((call) => call.file === process.execPath || call.args.includes('down')),
    false,
  );
});

test('integration workflow reuses test safety checks before a serial suite on the separate test target', async () => {
  const { calls, tools } = dockerFixture();
  await runLocal('test', config, tools);
  const nodeCalls = calls.filter((call) => call.file === process.execPath);
  assert.deepEqual(nodeCalls[0].args, ['--import', 'tsx', 'test/migrate.ts']);
  assert.equal(
    new URL(nodeCalls[0].options.env.TEST_DATABASE_URL).pathname,
    '/vocabulary_local_test',
  );
  assert.equal(new URL(nodeCalls[0].options.env.DATABASE_URL).pathname, '/vocabulary_local');
  assert.ok(nodeCalls[1].args.includes('integration'));
  assert.ok(nodeCalls[1].args.includes('--no-file-parallelism'));
  assert.ok(calls.findIndex((call) => call.args[0] === 'exec') < calls.indexOf(nodeCalls[1]));
});
