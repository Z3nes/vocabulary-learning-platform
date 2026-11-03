// Database-free fixture for real Node/tsx-watch startup and process-tree cleanup tests.
import { createServer } from 'node:http';

if (process.argv.includes('--fail')) {
  process.stderr.write('[vocab-dev] api-failed\n', () => process.exit(1));
} else {
  const server = createServer((_request, response) => response.end('fixture-ok'));
  server.listen(0, '127.0.0.1', () => {
    console.log(
      '[fixture] ' +
        JSON.stringify({
          role: process.argv.at(-1),
          port: server.address().port,
          pid: process.pid,
          runner: process.env['VOCAB_DEV_RUNNER'] === '1',
          piped: !process.stdout.isTTY,
        }),
    );
    if (process.env['VOCAB_DEV_RUNNER'] === '1') console.log('[vocab-dev] api-ready');
  });
}
