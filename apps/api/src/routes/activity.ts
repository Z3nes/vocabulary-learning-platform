import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '../generated/prisma/client.js';
import { sessionSelection, sessionSummaryView } from '../study/view.js';

export function newestActivities<T extends { at: string; key: string }>(rows: T[]): T[] {
  return rows.sort((a, b) => b.at.localeCompare(a.at) || b.key.localeCompare(a.key)).slice(0, 50);
}
export function registerActivityRoutes(
  app: FastifyInstance,
  database: () => PrismaClient,
  owner: (request: object) => string,
) {
  app.get('/activity', async (request) => {
    const ownerId = owner(request);
    const [sessions, games] = await database().$transaction([
      database().studySession.findMany({
        where: { ownerId, status: { in: ['COMPLETED', 'ENDED_EARLY'] } },
        select: { ...sessionSelection, cards: { select: { outcome: true } } },
        orderBy: [{ finishedAt: 'desc' }, { id: 'desc' }],
        take: 50,
      }),
      database().completedGame.findMany({
        where: { ownerId },
        select: {
          id: true,
          wordListId: true,
          listTitle: true,
          gameType: true,
          completedAt: true,
          items: true,
        },
        orderBy: [{ completedAt: 'desc' }, { id: 'desc' }],
        take: 50,
      }),
    ]);
    return {
      activities: newestActivities([
        ...sessions.map(({ cards, ...session }) => ({
          kind: 'flashcard' as const,
          key: `flashcard:${session.id}`,
          at: session.finishedAt!.toISOString(),
          session: sessionSummaryView(session, cards),
        })),
        ...games.map((game) => ({
          kind: 'game' as const,
          key: `game:${game.id}`,
          at: game.completedAt.toISOString(),
          game,
        })),
      ]),
    };
  });
}
