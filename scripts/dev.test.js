import { EventEmitter } from 'node:events';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PassThrough, Writable } from 'node:stream';
import { test } from 'node:test';
import { startDevelopment } from './dev.js';
import { createDevelopmentRunner, developmentProcesses } from './dev-processes.js';

function fixture(options = {}) {
  const runs = [];
  const log = [];
  const signals = new EventEmitter();
  const stream = () => {
    const emitter = new EventEmitter();
    return {
      subscribe: (listener) => {
        emitter.on('data', listener);
        return { unsubscribe: () => emitter.off('data', listener) };
      },
      emit: (text) => emitter.emit('data', Buffer.from(text)),
    };
  };
  const run = (commands, options) => {
    let close;
    let fail;
    const result = new Promise((resolve, reject) => {
      close = resolve;
      fail = reject;
    });
    const command = {
      stdout: stream(),
      stderr: stream(),
      kills: [],
      kill(signal) {
        this.kills.push(signal);
        close([]);
      },
    };
    const session = {
      commands: [command],
      result,
      close: () => close([]),
      fail: () => fail([]),
      input: commands,
      options,
    };
    runs.push(session);
    return session;
  };
  const dev = startDevelopment({ run, signals, report: (line) => log.push(line), ...options });
  return { dev, runs, signals, log };
}
test('root dev script starts the coordinator and retains workspace commands/env loading', () => {
  const root = JSON.parse(readFileSync(new URL('../package.json', import.meta.url)));
  const api = JSON.parse(readFileSync(new URL('../apps/api/package.json', import.meta.url)));
  assert.equal(root.scripts.dev, 'node scripts/dev.js');
  assert.match(api.scripts.dev, /--env-file-if-exists=\.env/u);
  assert.equal(api.scripts.dev, 'tsx ' + developmentProcesses.api.args.slice(1).join(' '));
  const web = JSON.parse(readFileSync(new URL('../apps/web/package.json', import.meta.url)));
  assert.equal(web.scripts.dev, 'vite');
});
test('starts Vite only after explicit API readiness, including split output chunks', async () => {
  const { dev, runs, signals } = fixture();
  assert.equal(runs.length, 1);
  assert.equal(runs[0].input[0].command, 'api');
  assert.equal(runs[0].input[0].env.VOCAB_DEV_RUNNER, '1');
  runs[0].commands[0].stdout.emit('Ordinary log\n[vocab-dev] api-');
  assert.equal(runs.length, 1);
  runs[0].commands[0].stdout.emit('ready\n[vocab-dev] api-ready\n');
  assert.equal(runs.length, 2);
  assert.equal(runs[1].input[0].command, 'web');
  assert.equal(runs[0].options.prefix, 'name');
  signals.emit('SIGINT');
  assert.equal(await dev.result, 0);
  assert.equal(
    runs.every((run) => run.commands[0].kills.includes('SIGTERM')),
    true,
  );
  assert.equal(signals.listenerCount('SIGINT'), 0);
});
test('an API startup failure stops its watch supervisor without starting Vite', async () => {
  const { dev, runs, log } = fixture();
  runs[0].commands[0].stderr.emit('[vocab-dev] api-failed\n');
  assert.equal(await dev.result, 1);
  assert.equal(runs.length, 1);
  assert.ok(log.some((line) => line.includes('API startup failed')));
});
test('a failing service stops the other managed process tree', async () => {
  const { dev, runs } = fixture();
  runs[0].commands[0].stdout.emit('[vocab-dev] api-ready\n');
  runs[1].fail();
  assert.equal(await dev.result, 1);
  assert.deepEqual(runs[0].commands[0].kills, ['SIGTERM']);
});
test('spawn failures remain observable and result in a failing exit', async () => {
  const log = [];
  const dev = startDevelopment({
    run: () => {
      throw Object.assign(new Error('private details'), { code: 'EPERM' });
    },
    signals: new EventEmitter(),
    report: (line) => log.push(line),
  });
  assert.equal(await dev.result, 1);
  assert.match(log.join(), /EPERM/u);
  assert.doesNotMatch(log.join(), /private details/u);
});
test('Ctrl+C before readiness stops only the API and never launches Vite', async () => {
  const { dev, runs, signals } = fixture();
  signals.emit('SIGINT');
  runs[0].commands[0].stdout.emit('[vocab-dev] api-ready\n');
  assert.equal(await dev.result, 0);
  assert.equal(runs.length, 1);
});
test('a broken API watch child cannot keep startup waiting indefinitely', async () => {
  const { dev, runs, log } = fixture({ startupTimeout: 1 });
  assert.equal(await dev.result, 1);
  assert.equal(runs.length, 1);
  assert.ok(log.some((line) => line.includes('did not report readiness')));
});

test('real concurrently forwards runner env and observes piped logs without shell/npm wrappers', async () => {
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  let captured;
  let logged = '';
  const run = createDevelopmentRunner({
    spawnProcess: (...args) => {
      captured = args;
      return child;
    },
    outputStream: new Writable({
      write(chunk, _encoding, done) {
        logged += chunk.toString();
        done();
      },
    }),
  });
  const running = run([{ name: 'api', command: 'api', env: { VOCAB_DEV_RUNNER: '1' } }], {
    prefix: 'name',
  });
  const [executable, args, options] = captured;
  assert.equal(executable, process.execPath);
  assert.deepEqual(args, developmentProcesses.api.args);
  assert.equal(options.cwd, developmentProcesses.api.cwd);
  assert.deepEqual(options.stdio, ['inherit', 'pipe', 'pipe']);
  assert.equal(options.shell, undefined);
  assert.equal(options.env.VOCAB_DEV_RUNNER, '1');
  assert.equal(options.env.SystemRoot, process.env.SystemRoot);
  let observed = '';
  running.commands[0].stdout.subscribe((chunk) => (observed += chunk.toString()));
  child.stdout.write('[vocab-dev] api-');
  child.stdout.write('ready\r\n');
  child.emit('close', 0, null);
  await running.result;
  assert.equal(observed, '[vocab-dev] api-ready\r\n');
  assert.match(logged, /\[api\].*api-ready/u);
});
