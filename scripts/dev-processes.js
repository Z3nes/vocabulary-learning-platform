import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createConcurrently, Logger, LogError, LogExit, LogOutput } from 'concurrently';

const root = fileURLToPath(new URL('../', import.meta.url));

export const developmentProcesses = {
  api: {
    cwd: join(root, 'apps/api'),
    args: [
      fileURLToPath(import.meta.resolve('tsx/cli')),
      'watch',
      '--env-file-if-exists=.env',
      'src/server.ts',
    ],
  },
  web: {
    cwd: join(root, 'apps/web'),
    args: [join(dirname(fileURLToPath(import.meta.resolve('vite/package.json'))), 'bin/vite.js')],
  },
};

/** Use Node directly: no cmd/npm wrappers or unconsumed stdin pipe around watch processes. */
export function createDevelopmentRunner({
  processes = developmentProcesses,
  spawnProcess = spawn,
  outputStream = process.stdout,
} = {}) {
  return (commands, options) => {
    const logger = new Logger({ prefixFormat: options.prefix });
    return createConcurrently(commands, {
      ...options,
      logger,
      outputStream,
      // The coordinator owns signals; concurrently still owns descendant-tree termination.
      controllers: [new LogError({ logger }), new LogOutput({ logger }), new LogExit({ logger })],
      spawn(command, spawnOptions) {
        const service = processes[command];
        if (!service) throw new Error('Unknown development process');
        return spawnProcess(process.execPath, service.args, {
          ...spawnOptions,
          cwd: service.cwd,
          stdio: ['inherit', 'pipe', 'pipe'],
        });
      },
    });
  };
}
