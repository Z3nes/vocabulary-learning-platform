import Fastify, { type FastifyInstance } from 'fastify';
import type { AppConfig } from './config/env.js';
import { createPgHealthChecker, type DbHealthChecker } from './db/health.js';
import { healthRoutes } from './routes/health.js';
import { developmentIdentityProvider, type IdentityProvider } from './auth/identity.js';
import { createDatabase } from './db/client.js';
import type { PrismaClient } from './generated/prisma/client.js';
import { listRoutes } from './routes/lists.js';
import { ConfigError } from './config/env.js';
import type { ExampleService } from './examples/service.js';
import { AzureSpeechProvider } from './speech/azure.js';
import { SpeechService } from './speech/service.js';
import { speechConfigSchema } from './speech/config.js';

export interface BuildAppOptions {
  config: AppConfig;
  /** Injected in tests; defaults to the real `pg`-backed checker. */
  dbHealth?: DbHealthChecker;
  /** Set to false to silence logging (tests). Defaults to `config.logLevel`. */
  logger?: boolean;
  /** Dependency injection is limited to isolated test processes. */
  identityProvider?: IdentityProvider;
  db?: PrismaClient;
  examples?: ExampleService;
  speech?: SpeechService;
}

export async function buildApp(options: BuildAppOptions): Promise<FastifyInstance> {
  const { config } = options;
  if (config.nodeEnv === 'production' && config.authMode === 'dev') {
    throw new ConfigError('Development authentication is forbidden in production');
  }
  if (
    (options.identityProvider || options.db || options.examples || options.speech) &&
    config.nodeEnv !== 'test'
  ) {
    throw new ConfigError('Test dependencies are forbidden outside test mode');
  }
  const app = Fastify({
    logger: options.logger === false ? false : { level: config.logLevel },
  });

  const dbHealth =
    options.dbHealth ??
    createPgHealthChecker({
      connectionString: config.databaseUrl,
      onError: (error) => {
        // Driver messages can contain connection details; log only a generic event.
        void error;
        app.log.warn('Database health check failed');
      },
    });

  app.addHook('onClose', async () => {
    await dbHealth.close();
  });

  const db = options.db ?? (config.databaseUrl ? createDatabase(config.databaseUrl) : undefined);
  const identityProvider =
    options.identityProvider ??
    (config.authMode === 'dev' ? developmentIdentityProvider : undefined);
  app.addHook('onClose', async () => {
    if (!options.db) await db?.$disconnect();
  });
  await app.register(listRoutes, {
    prefix: config.apiPrefix === '/' ? '' : config.apiPrefix,
    db,
    identityProvider,
    examples: options.examples,
    exampleSentencesEnabled: config.exampleSentencesEnabled === true,
    speech:
      options.speech ??
      new SpeechService(
        new AzureSpeechProvider(config.speech ?? speechConfigSchema.parse({})),
        config.speech?.cacheEnabled ?? false,
      ),
  });

  await app.register(healthRoutes, {
    prefix: config.apiPrefix === '/' ? '' : config.apiPrefix,
    dbHealth,
  });

  return app;
}
