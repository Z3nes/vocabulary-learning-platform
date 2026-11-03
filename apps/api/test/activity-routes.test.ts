import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '../src/generated/prisma/client.js';
import { registerActivityRoutes } from '../src/routes/activity.js';
import { registerReviewRoutes } from '../src/routes/review.js';
import { installErrorHandler } from '../src/http/errors.js';
function fixture() {
  const session = {
    id: 'session',
    wordListId: 'list',
    listTitle: 'Historical title',
    direction: 'EN_TR',
    percentage: 50,
    cardCount: 1,
    status: 'ENDED_EARLY',
    version: 1,
    startedAt: new Date('2026-01-01'),
    finishedAt: new Date('2026-01-02'),
    cards: [{ outcome: null }],
  };
  const game = {
    id: 'game',
    wordListId: 'list',
    listTitle: 'Snapshot title',
    gameType: 'quiz',
    completedAt: new Date('2026-01-03'),
    items: [
      { wordId: null, english: 'old word', meanings: ['eski'], outcome: 'incorrect', attempts: 1 },
    ],
  };
  const models = {
    studySession: { findMany: vi.fn().mockResolvedValue([session]) },
    completedGame: { findMany: vi.fn().mockResolvedValue([game]) },
    wordProgress: {
      count: vi.fn().mockResolvedValueOnce(3).mockResolvedValueOnce(1),
      findMany: vi.fn().mockResolvedValue([
        {
          wordId: 'word',
          knownStreak: 1,
          word: {
            english: 'current word',
            meanings: [{ turkish: 'güncel' }],
            wordList: { id: 'list', title: 'Current title', studySessions: [{ id: 'active' }] },
          },
        },
      ]),
    },
    $transaction: (operations: Promise<unknown>[]) => Promise.all(operations),
  };
  const app = Fastify();
  installErrorHandler(app);
  const database = () => models as unknown as PrismaClient;
  registerActivityRoutes(app, database, () => 'authenticated-owner');
  registerReviewRoutes(app, database, () => 'authenticated-owner');
  return { app, models };
}
describe('activity and review API contracts with mocked queries', () => {
  it('merges real source shapes and preserves historical text', async () => {
    const { app } = fixture();
    try {
      const response = await app.inject('/activity');
      expect(response.statusCode).toBe(200);
      expect(response.json<unknown>()).toMatchObject({
        activities: [
          { kind: 'game', game: { listTitle: 'Snapshot title', items: [{ english: 'old word' }] } },
          { kind: 'flashcard', session: { status: 'ended_early', counts: { unanswered: 1 } } },
        ],
      });
    } finally {
      await app.close();
    }
  });
  it('scopes and bounds both sources and excludes active flashcards', async () => {
    const { app, models } = fixture();
    try {
      await app.inject('/activity');
      expect(models.studySession.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { ownerId: 'authenticated-owner', status: { in: ['COMPLETED', 'ENDED_EARLY'] } },
          take: 50,
        }),
      );
      expect(models.completedGame.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { ownerId: 'authenticated-owner' }, take: 50 }),
      );
    } finally {
      await app.close();
    }
  });
  it('returns review metadata and active-session association', async () => {
    const { app } = fixture();
    try {
      expect((await app.inject('/review')).json<unknown>()).toEqual({
        evaluatedCount: 3,
        total: 1,
        next: null,
        words: [
          {
            wordId: 'word',
            knownStreak: 1,
            english: 'current word',
            meanings: ['güncel'],
            listId: 'list',
            listTitle: 'Current title',
            activeSessionId: 'active',
          },
        ],
      });
    } finally {
      await app.close();
    }
  });
  it('scopes review queries to the owner and current review flag', async () => {
    const { app, models } = fixture();
    try {
      await app.inject('/review');
      expect(models.wordProgress.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { word: { wordList: { ownerId: 'authenticated-owner' } }, needsReview: true },
          take: 101,
        }),
      );
    } finally {
      await app.close();
    }
  });
  it('rejects invalid cursor and identity parameters without querying progress', async () => {
    const { app, models } = fixture();
    try {
      expect((await app.inject('/review?after=invalid')).statusCode).toBe(400);
      expect((await app.inject('/review?ownerId=forged')).statusCode).toBe(400);
      expect(models.wordProgress.findMany).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });
});
