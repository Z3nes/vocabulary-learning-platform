import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Writable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { createDevelopmentRunner, developmentProcesses } from './dev-processes.js';
import { startDevelopment } from './dev.js';

function realSession({ fail = false } = {}) {
  const fixture = fileURLToPath(new URL('./fixtures/dev-service.js', import.meta.url));
  const records = [];
  const log = [];
  let buffer = '';
  let ready;
  const bothListening = new Promise((resolve) => (ready = resolve));
  const outputStream = new Writable({
    write(chunk, _encoding, done) {
      buffer += chunk.toString();
      const lines = buffer.split(/\r?\n/u);
      buffer = lines.pop();
      for (const line of lines) {
        const match = /\[fixture\] (\{.*\})/u.exec(line);
        if (!match) continue;
        const record = JSON.parse(match[1]);
        records.push(record);
        // The API must be listening before the web child even exists.
        if (record.role === 'web') ready(records);
      }
      done();
    },
  });
  const processes = {
    api: {
      cwd: developmentProcesses.api.cwd,
      args: [
        developmentProcesses.api.args[0],
        'watch',
        fixture,
        ...(fail ? ['--fail'] : []),
        'api',
      ],
    },
    web: { cwd: developmentProcesses.web.cwd, args: [fixture, 'web'] },
  };
  const signals = new EventEmitter();
  const dev = startDevelopment({
    run: createDevelopmentRunner({ processes, outputStream }),
    signals,
    report: (line) => log.push(line),
    startupTimeout: 20_000,
  });
  return { dev, signals, records, log, bothListening };
}

function skipSpawnRestriction(t, session) {
  if (!session.log.some((line) => line.includes('(EPERM)'))) return false;
  t.skip('Environment blocks real child spawning (EPERM); run this test locally on Windows.');
  return true;
}

test(
  'real piped tsx watch forwards env, gates web readiness, and stops its descendant server',
  { timeout: 30_000 },
  async (t) => {
    const session = realSession();
    t.after(async () => {
      session.dev.stop(1);
      await session.dev.result;
    });
    const records = await Promise.race([
      session.bothListening,
      session.dev.result.then(() => null),
    ]);
    if (!records && skipSpawnRestriction(t, session)) return;
    assert.ok(records, session.log.join('\n'));
    assert.deepEqual(
      records.map((record) => record.role),
      ['api', 'web'],
    );
    assert.equal(records[0].runner, true);
    assert.equal(records[0].piped, true);
    assert.equal(records[1].piped, true);
    for (const record of records) {
      const response = await fetch(`http://127.0.0.1:${record.port}`, {
        signal: AbortSignal.timeout(3000),
      });
      assert.equal(await response.text(), 'fixture-ok');
    }
    session.signals.emit('SIGINT');
    assert.equal(await session.dev.result, 0);
    for (const record of records) {
      // Watcher close must also close the actual child server, not just tsx's parent.
      assert.throws(() => process.kill(record.pid, 0), { code: 'ESRCH' });
      await assert.rejects(
        fetch(`http://127.0.0.1:${record.port}`, { signal: AbortSignal.timeout(3000) }),
      );
    }
  },
);

test(
  'real watched startup failure exits promptly without starting web',
  { timeout: 30_000 },
  async (t) => {
    const session = realSession({ fail: true });
    t.after(async () => {
      session.dev.stop(1);
      await session.dev.result;
    });
    assert.equal(await session.dev.result, 1);
    if (skipSpawnRestriction(t, session)) return;
    assert.ok(
      session.log.some((line) => line.includes('API startup failed')),
      session.log.join('\n'),
    );
    assert.equal(session.records.length, 0);
  },
);
