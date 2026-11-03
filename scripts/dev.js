import { pathToFileURL } from 'node:url';
import { createDevelopmentRunner } from './dev-processes.js';

const readyMarker = '[vocab-dev] api-ready';
const failedMarker = '[vocab-dev] api-failed';

/** Coordinate readiness without sleeps; concurrently owns cross-platform process trees. */
export function startDevelopment({
  run = createDevelopmentRunner(),
  signals = process,
  report = console.log,
  startupTimeout = 30_000,
} = {}) {
  const sessions = [];
  const subscriptions = [];
  let stopping = false;
  let webStarted = false;
  let exitCode = 0;
  let timer;
  let shutdownTimer;
  let finish;
  const result = new Promise((resolve) => {
    finish = resolve;
  });

  function complete() {
    if (!stopping || sessions.some((session) => !session.closed)) return;
    clearTimeout(timer);
    clearTimeout(shutdownTimer);
    subscriptions.forEach((subscription) => subscription.unsubscribe());
    signals.off('SIGINT', interrupt);
    signals.off('SIGTERM', terminate);
    finish(exitCode);
  }
  function stop(code) {
    if (stopping) return;
    stopping = true;
    exitCode = code;
    clearTimeout(timer);
    for (const session of sessions) for (const command of session.commands) command.kill('SIGTERM');
    if (sessions.some((session) => !session.closed))
      shutdownTimer = setTimeout(() => {
        for (const session of sessions.filter((session) => !session.closed))
          for (const command of session.commands) command.kill('SIGKILL');
      }, 5000).unref();
    complete();
  }
  function interrupt() {
    stop(0);
  }
  function terminate() {
    stop(1);
  }
  signals.on('SIGINT', interrupt);
  signals.on('SIGTERM', terminate);

  function launch(name, command, env = {}) {
    let running;
    try {
      running = run([{ name, command, env }], {
        prefix: 'name',
        prefixColors: name === 'api' ? ['blue'] : ['magenta'],
        killTimeout: 5000,
      });
    } catch (error) {
      const code =
        error instanceof Error &&
        'code' in error &&
        typeof error.code === 'string' &&
        /^E[A-Z]{1,20}$/u.test(error.code)
          ? error.code
          : 'UNKNOWN';
      report(`[dev] Unable to start ${name} (${code}).`);
      stop(1);
      return;
    }
    const session = { ...running, closed: false };
    sessions.push(session);
    running.result.then(
      () => {
        session.closed = true;
        if (!stopping) {
          report(`[dev] ${name} exited; stopping the managed session.`);
          stop(1);
        }
        complete();
      },
      () => {
        session.closed = true;
        if (!stopping) {
          report(`[dev] ${name} failed; stopping the managed session.`);
          stop(1);
        }
        complete();
      },
    );
    return session;
  }
  function observe(stream, receive) {
    let buffered = '';
    subscriptions.push(
      stream.subscribe((chunk) => {
        buffered += chunk.toString();
        const lines = buffered.split(/\r?\n/u);
        buffered = lines.pop() ?? '';
        for (const line of lines) receive(line.trim());
      }),
    );
  }
  const api = launch('api', 'api', { VOCAB_DEV_RUNNER: '1' });
  if (api && !stopping) {
    timer = setTimeout(() => {
      report('[dev] API did not report readiness within 30 seconds. Check the API logs above.');
      stop(1);
    }, startupTimeout);
    const receive = (line) => {
      if (line === failedMarker) {
        report('[dev] API startup failed. Check the API logs above.');
        stop(1);
      }
      if (line === readyMarker && !stopping && !webStarted) {
        webStarted = true;
        clearTimeout(timer);
        report('[dev] API is listening; starting web.');
        launch('web', 'web');
      }
    };
    for (const command of api.commands) {
      observe(command.stdout, receive);
      observe(command.stderr, receive);
    }
  }
  return { result, stop };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const session = startDevelopment();
  process.exitCode = await session.result;
}
