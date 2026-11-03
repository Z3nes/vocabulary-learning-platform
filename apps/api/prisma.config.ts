import { defineConfig } from 'prisma/config';

// Load apps/api/.env when present (Node built-in; no dotenv dependency).
try {
  process.loadEnvFile('.env');
} catch {
  // No .env file: rely on the process environment.
}

const shadowDatabaseUrl = process.env['SHADOW_DATABASE_URL']?.trim();

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // No runtime-credential fallback. Offline generate/validate need no connection.
    url: process.env['MIGRATION_DATABASE_URL'] ?? '',
    // Even migrate deploy rejects an explicit empty shadow URL with P1013.
    ...(shadowDatabaseUrl ? { shadowDatabaseUrl } : {}),
  },
});
