import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import type { PrismaClient } from '../src/generated/prisma/client.js';
import { ExampleService } from '../src/examples/service.js';
import { ApplicationError } from '../src/http/errors.js';
import { testConfig } from './helpers.js';

const listId = '10000000-0000-4000-8000-000000000001';
const wordId = '10000000-0000-4000-8000-000000000002';
const sessionId = '10000000-0000-4000-8000-000000000003';
const cardId = '10000000-0000-4000-8000-000000000004';
const wordUrl = `/api/lists/${listId}/words/${wordId}/examples`;
const cardUrl = `/api/study-sessions/${sessionId}/cards/${cardId}/examples`;
const apps: FastifyInstance[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});
async function fixture(authenticated = true) {
  const models = {
    userIdentity: {
      findUnique: vi
        .fn()
        .mockImplementation((args: { where: { provider_subject: { subject: string } } }) =>
          Promise.resolve({ userId: args.where.provider_subject.subject }),
        ),
    },
    word: {
      findFirst: vi
        .fn()
        .mockImplementation((args: { where: { wordList: { ownerId: string } } }) =>
          Promise.resolve(args.where.wordList.ownerId === 'a' ? { english: 'run' } : null),
        ),
    },
    studyCard: {
      findFirst: vi
        .fn()
        .mockImplementation((args: { where: { session: { ownerId: string } } }) =>
          Promise.resolve(args.where.session.ownerId === 'a' ? { english: 'give up' } : null),
        ),
    },
  };
  const candidates = vi.fn().mockResolvedValue([]);
  const service = new ExampleService({ candidates });
  const lookup = vi.spyOn(service, 'lookup');
  const app = await buildApp({
    config: testConfig({ exampleSentencesEnabled: true }),
    db: models as unknown as PrismaClient,
    examples: service,
    identityProvider: {
      resolve: (request) =>
        Promise.resolve(
          authenticated
            ? { provider: 'test', subject: String(request.headers['x-test-user'] ?? 'a') }
            : null,
        ),
    },
    logger: false,
  });
  apps.push(app);
  return { app, models, candidates, lookup };
}
describe('authorized examples route contracts', () => {
  it('resolves saved English under BOTH word and list ownership before service access', async () => {
    const { app, models, lookup } = await fixture();
    const response = await app.inject(wordUrl);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ examples: [] });
    expect(response.headers['cache-control']).toBe('no-store');
    expect(models.word.findFirst).toHaveBeenCalledWith({
      where: { id: wordId, wordListId: listId, wordList: { ownerId: 'a' } },
      select: { english: true },
    });
    expect(lookup).toHaveBeenCalledWith('run', []);
  });
  it('rejects foreign vocabulary/list before touching even an already populated cache', async () => {
    const { app, models, candidates, lookup } = await fixture();
    await app.inject(wordUrl);
    lookup.mockClear();
    const foreign = await app.inject({ url: wordUrl, headers: { 'x-test-user': 'b' } });
    expect(foreign.statusCode).toBe(404);
    expect(lookup).not.toHaveBeenCalled();
    expect(candidates).toHaveBeenCalledTimes(1);
    models.word.findFirst.mockResolvedValueOnce(null);
    expect((await app.inject(wordUrl)).statusCode).toBe(404);
    expect(lookup).not.toHaveBeenCalled();
  });
  it('shares cached pools across independently authorized students', async () => {
    const { app, models, candidates } = await fixture();
    models.word.findFirst.mockResolvedValue({ english: 'run' });
    await app.inject(wordUrl);
    await app.inject({ url: wordUrl, headers: { 'x-test-user': 'b' } });
    expect(models.word.findFirst).toHaveBeenCalledTimes(2);
    expect(candidates).toHaveBeenCalledTimes(1);
  });
  it('resolves an owned active card snapshot without joining the mutable/deleted word', async () => {
    const { app, models, lookup } = await fixture();
    expect((await app.inject(cardUrl)).statusCode).toBe(200);
    expect(models.studyCard.findFirst).toHaveBeenCalledWith({
      where: { id: cardId, sessionId, session: { ownerId: 'a', status: 'ACTIVE' } },
      select: { english: true },
    });
    expect(lookup).toHaveBeenCalledWith('give up', []);
    expect(models.word.findFirst).not.toHaveBeenCalled();
  });
  it('rejects foreign or unavailable sessions before provider access', async () => {
    const { app, lookup } = await fixture();
    expect((await app.inject({ url: cardUrl, headers: { 'x-test-user': 'b' } })).statusCode).toBe(
      404,
    );
    expect(lookup).not.toHaveBeenCalled();
  });
  it('requires authentication before database vocabulary access', async () => {
    const { app, models, candidates } = await fixture(false);
    expect((await app.inject(wordUrl)).statusCode).toBe(401);
    expect(models.word.findFirst).not.toHaveBeenCalled();
    expect(candidates).not.toHaveBeenCalled();
  });
  it.each([
    '?english=run',
    '?userId=a',
    '?exclude=1,1',
    '?exclude=-1',
    '?exclude=1|2',
    '?exclude=0',
    '?exclude=1.5',
    '?exclude=9007199254740992',
    '?exclude=1,2,3,4,5,6,7,8,9,10',
    '?exclude=',
    '?exclude=1&exclude=2',
  ])('strictly rejects unsafe query %s', async (query) => {
    const { app, models, candidates } = await fixture();
    expect((await app.inject(wordUrl + query)).statusCode).toBe(400);
    expect(models.word.findFirst).not.toHaveBeenCalled();
    expect(candidates).not.toHaveBeenCalled();
  });
  it.each(['/api/lists/bad/words/bad/examples', '/api/study-sessions/bad/cards/bad/examples'])(
    'rejects invalid identifiers %s',
    async (url) => {
      const { app, lookup } = await fixture();
      expect((await app.inject(url)).statusCode).toBe(400);
      expect(lookup).not.toHaveBeenCalled();
    },
  );
  it('accepts at most nine unique numeric recent ids as a selection preference', async () => {
    const { app, lookup } = await fixture();
    expect((await app.inject(wordUrl + '?exclude=1,2,3,4,5,6,7,8,9')).statusCode).toBe(200);
    expect(lookup).toHaveBeenCalledWith('run', ['1', '2', '3', '4', '5', '6', '7', '8', '9']);
  });
  it('limits by authenticated user across both endpoints with a safe Retry-After', async () => {
    const { app, models } = await fixture();
    for (let i = 0; i < 20; i++)
      expect((await app.inject(i % 2 ? cardUrl : wordUrl)).statusCode).toBe(200);
    const limited = await app.inject(wordUrl);
    expect(limited.statusCode).toBe(429);
    expect(limited.json()).toEqual({ error: { code: 'EXAMPLES_RATE_LIMITED' } });
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
    models.word.findFirst.mockResolvedValueOnce({ english: 'run' });
    expect((await app.inject({ url: wordUrl, headers: { 'x-test-user': 'b' } })).statusCode).toBe(
      200,
    );
  });
  it.each([
    [504, 'EXAMPLES_TIMEOUT'],
    [503, 'EXAMPLES_UNAVAILABLE'],
    [502, 'EXAMPLES_INVALID_RESPONSE'],
    [503, 'EXAMPLES_BUSY'],
    [429, 'EXAMPLES_RATE_LIMITED'],
  ])('safely maps provider %s / %s', async (status, code) => {
    const { app, candidates } = await fixture();
    candidates.mockRejectedValue(new ApplicationError(Number(status), String(code)));
    const response = await app.inject(wordUrl);
    expect(response.statusCode).toBe(status);
    expect(response.json()).toEqual({ error: { code } });
  });
  it('distinguishes unsupported vocabulary from no results', async () => {
    const { app, models, candidates } = await fixture();
    models.word.findFirst.mockResolvedValueOnce({ english: 'C++' });
    const response = await app.inject(wordUrl);
    expect(response.statusCode).toBe(422);
    expect(response.json()).toEqual({ error: { code: 'EXAMPLES_UNSUPPORTED' } });
    expect(candidates).not.toHaveBeenCalled();
  });
});
