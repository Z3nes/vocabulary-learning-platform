import type { FastifyRequest } from 'fastify';
import type { PrismaClient } from '../generated/prisma/client.js';
import { Prisma } from '../generated/prisma/client.js';

export interface ProviderIdentity {
  provider: string;
  subject: string;
}

/** A future verified SSO adapter implements this boundary, never client user IDs. */
export interface IdentityProvider {
  resolve(request: FastifyRequest): Promise<ProviderIdentity | null>;
}

export const developmentIdentityProvider: IdentityProvider = {
  resolve: () => Promise.resolve({ provider: 'dev', subject: 'dev-user' }),
};

export async function resolveUser(db: PrismaClient, identity: ProviderIdentity): Promise<string> {
  const where = { provider_subject: identity };
  const existing = await db.userIdentity.findUnique({ where, select: { userId: true } });
  if (existing) return existing.userId;
  try {
    // Nested creation is transactional: losing a unique-key race rolls back its User too.
    const created = await db.userIdentity.create({
      data: { ...identity, user: { create: {} } },
      select: { userId: true },
    });
    return created.userId;
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
      throw error;
    }
    const winner = await db.userIdentity.findUniqueOrThrow({ where, select: { userId: true } });
    return winner.userId;
  }
}
