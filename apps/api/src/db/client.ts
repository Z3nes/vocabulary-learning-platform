import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';

/** Only the explicit runtime URL may reach the application adapter. */
export function createDatabase(databaseUrl: string): PrismaClient {
  if (!databaseUrl) throw new Error('Runtime database configuration is required');
  return new PrismaClient({
    adapter: new PrismaPg({
      connectionString: databaseUrl,
      connectionTimeoutMillis: 5000,
      max: 5,
    }),
  });
}
