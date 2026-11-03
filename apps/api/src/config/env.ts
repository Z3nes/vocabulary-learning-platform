import { z } from 'zod';
import { speechConfigSchema, type SpeechConfig } from '../speech/config.js';

const logLevels = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;

/** Normalizes "/api/" -> "/api"; "/" stays "/" (routes at the root). */
function normalizePrefix(prefix: string): string {
  const trimmed = prefix.replace(/\/+$/, '');
  return trimmed === '' ? '/' : trimmed;
}

const envSchema = z.object({
  HOST: z.string().trim().min(1).default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  API_PREFIX: z
    .string()
    .trim()
    .regex(/^\/[A-Za-z0-9/_-]*$/, 'API_PREFIX must start with "/" and use URL-safe path characters')
    .default('/api')
    .transform(normalizePrefix),
  LOG_LEVEL: z.enum(logLevels).default('info'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  AUTH_MODE: z.literal('dev').optional(),
  EXAMPLE_SENTENCES_ENABLED: z.enum(['true', 'false']).default('false'),
  DATABASE_URL: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value ? value : undefined))
    .refine((value) => value === undefined || /^postgres(ql)?:\/\//.test(value), {
      message: 'DATABASE_URL must be a postgresql:// connection string',
    }),
});

export interface AppConfig {
  speech?: SpeechConfig;
  exampleSentencesEnabled?: boolean;
  host: string;
  port: number;
  apiPrefix: string;
  logLevel: (typeof logLevels)[number];
  /** Undefined when no database is configured. Never log or return this value. */
  databaseUrl: string | undefined;
  nodeEnv: 'development' | 'test' | 'production';
  authMode: 'dev' | undefined;
}

export class ConfigError extends Error {
  override name = 'ConfigError';
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const result = envSchema.safeParse(env);
  if (!result.success) {
    // prettifyError lists paths and messages only, not the rejected input values.
    throw new ConfigError(`Invalid environment configuration:\n${z.prettifyError(result.error)}`);
  }
  const { HOST, PORT, API_PREFIX, LOG_LEVEL, DATABASE_URL, NODE_ENV, AUTH_MODE } = result.data;
  const speech = speechConfigSchema.safeParse({
    enabled:
      env['AZURE_SPEECH_ENABLED'] === undefined ? true : env['AZURE_SPEECH_ENABLED'] === 'true',
    ...(env['AZURE_SPEECH_KEY'] ? { key: env['AZURE_SPEECH_KEY'] } : {}),
    ...(env['AZURE_SPEECH_REGION'] ? { region: env['AZURE_SPEECH_REGION'] } : {}),
    ...(env['AZURE_SPEECH_VOICE'] ? { voice: env['AZURE_SPEECH_VOICE'] } : {}),
    ...(env['AZURE_SPEECH_FORMAT'] ? { format: env['AZURE_SPEECH_FORMAT'] } : {}),
    cacheEnabled: env['AZURE_SPEECH_CACHE_ENABLED'] === 'true',
  });
  if (
    !speech.success ||
    ['AZURE_SPEECH_ENABLED', 'AZURE_SPEECH_CACHE_ENABLED'].some(
      (key) => env[key] !== undefined && !['true', 'false'].includes(env[key]),
    )
  )
    throw new ConfigError(
      'Invalid speech configuration; check enabled flags, paired key/region, reviewed English voice and format',
    );
  if (NODE_ENV === 'production' && AUTH_MODE === 'dev') {
    throw new ConfigError('Development authentication is forbidden in production');
  }
  return {
    host: HOST,
    port: PORT,
    apiPrefix: API_PREFIX,
    logLevel: LOG_LEVEL,
    databaseUrl: DATABASE_URL,
    nodeEnv: NODE_ENV,
    authMode: AUTH_MODE,
    exampleSentencesEnabled: result.data.EXAMPLE_SENTENCES_ENABLED === 'true',
    speech: speech.data,
  };
}
