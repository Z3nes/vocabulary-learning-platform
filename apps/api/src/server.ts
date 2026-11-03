import { buildApp } from './app.js';
import { ConfigError, loadConfig } from './config/env.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const app = await buildApp({ config });

  const shutdown = (signal: NodeJS.Signals) => {
    app.log.info({ signal }, 'Shutting down');
    app.close().then(
      () => process.exit(0),
      (error: unknown) => {
        void error;
        app.log.error('Error during shutdown');
        process.exit(1);
      },
    );
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);

  await app.listen({ host: config.host, port: config.port });
  if (process.env['VOCAB_DEV_RUNNER'] === '1') console.log('[vocab-dev] api-ready');
}

main().catch((error: unknown) => {
  const code =
    error instanceof Error &&
    'code' in error &&
    typeof error.code === 'string' &&
    ['EADDRINUSE', 'EACCES', 'EPERM'].includes(error.code)
      ? error.code
      : undefined;
  console.error(
    error instanceof ConfigError
      ? error.message
      : `Server startup failed${code ? ` (${code})` : ''}`,
  );
  if (process.env['VOCAB_DEV_RUNNER'] === '1') {
    // Flush the control event before exiting a watched child with piped stderr.
    process.stderr.write('[vocab-dev] api-failed\n', () => process.exit(1));
  } else process.exit(1);
});
