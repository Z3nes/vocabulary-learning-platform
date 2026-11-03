import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { PrismaClient } from '../generated/prisma/client.js';
import { ApplicationError } from '../http/errors.js';
import { studyPercentages } from '../study/selection.js';
import {
  activePractice,
  advancePractice,
  finishPractice,
  getPractice,
  startPractice,
  submitPractice,
  skipPractice,
  speechQuestion,
} from '../practice/service.js';
import { practiceTypes } from '../practice/types.js';
import { SpeechRateLimit, type SpeechService } from '../speech/service.js';
import { spokenText } from '../speech/pronunciation.js';
import { speechLocale } from '../speech/config.js';
import { mixedAction, mixedSetup, startMixed } from '../practice/mixed.js';

const list = z.object({ listId: z.uuid() }).strict();
const session = z.object({ sessionId: z.uuid() }).strict();
const start = z
  .object({
    percentage: z.literal(studyPercentages),
    practiceType: z.enum(practiceTypes).default('written-recall'),
  })
  .strict();
const advance = z.object({ questionId: z.uuid(), version: z.int().min(0) }).strict();
const answer = advance
  .extend({
    answer: z
      .string()
      .max(500)
      .refine((s) => s.trim().length > 0),
  })
  .strict();
function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new ApplicationError(400, 'VALIDATION_FAILED');
  return result.data;
}
export function registerPracticeRoutes(
  app: FastifyInstance,
  database: () => PrismaClient,
  owner: (request: object) => string,
  speech: SpeechService,
) {
  const rate = new SpeechRateLimit();
  const scope = z.object({ listId: z.uuid().nullable() }).strict();
  app.get('/mixed', async (r) =>
    mixedSetup(
      database(),
      owner(r),
      parse(z.object({ listId: z.uuid().optional() }).strict(), r.query).listId ?? null,
    ),
  );
  app.post('/mixed', async (r, reply) => {
    const input = parse(scope.extend({ percentage: z.literal(studyPercentages) }).strict(), r.body);
    return reply
      .code(201)
      .send({ session: await startMixed(database(), owner(r), input.listId, input.percentage) });
  });
  for (const action of ['reveal', 'self-evaluation', 'choice'] as const)
    app.post(`/practice/:sessionId/${action}`, async (r) => {
      const params = parse(session, r.params);
      const input =
        action === 'self-evaluation'
          ? {
              ...parse(
                advance.extend({ evaluation: z.enum(['known', 'missed']) }).strict(),
                r.body,
              ),
              action,
            }
          : action === 'choice'
            ? { ...parse(advance.extend({ optionId: z.uuid() }).strict(), r.body), action }
            : { ...parse(advance, r.body), action };
      return mixedAction(database(), owner(r), params.sessionId, input);
    });
  app.get('/lists/:listId/practice/active', async (r) => ({
    session: await activePractice(
      database(),
      owner(r),
      parse(list, r.params).listId,
      parse(
        z.object({ practiceType: z.enum(practiceTypes).default('written-recall') }).strict(),
        r.query,
      ).practiceType,
    ),
  }));
  app.post('/lists/:listId/practice', async (r, reply) =>
    reply.code(201).send({
      session: await startPractice(
        database(),
        owner(r),
        parse(list, r.params).listId,
        parse(start, r.body).percentage,
        parse(start, r.body).practiceType,
      ),
    }),
  );
  app.get('/practice/:sessionId', async (r) => ({
    session: await getPractice(database(), owner(r), parse(session, r.params).sessionId),
  }));
  app.post('/practice/:sessionId/answers', async (r) =>
    submitPractice(database(), owner(r), parse(session, r.params).sessionId, parse(answer, r.body)),
  );
  app.post('/practice/:sessionId/next', async (r) =>
    advancePractice(
      database(),
      owner(r),
      parse(session, r.params).sessionId,
      parse(advance, r.body),
    ),
  );
  app.post('/practice/:sessionId/skip-audio', async (r) =>
    skipPractice(database(), owner(r), parse(session, r.params).sessionId, parse(advance, r.body)),
  );
  app.post('/practice/:sessionId/questions/:questionId/audio', async (r, reply) => {
    const params = parse(
      z.object({ sessionId: z.uuid(), questionId: z.uuid() }).strict(),
      r.params,
    );
    const input = parse(
      z.object({ provider: z.enum(['preferred', 'browser']).default('preferred') }).strict(),
      r.body,
    );
    parse(z.object({}).strict(), r.query);
    const ownerId = owner(r);
    const english = await speechQuestion(database(), ownerId, params.sessionId, params.questionId);
    if (input.provider === 'preferred') {
      try {
        rate.check(ownerId);
        const audio = await speech.audio(english);
        return reply.header('x-content-type-options', 'nosniff').type('audio/mpeg').send(audio);
      } catch {
        /* Only a safe fallback discriminator is returned, never provider details. */
      }
    }
    return { provider: 'browser', text: spokenText(english), locale: speechLocale };
  });
  for (const action of ['complete', 'cancel'] as const)
    app.post(`/practice/:sessionId/${action}`, async (r) => {
      parse(z.object({}).strict(), r.body);
      return finishPractice(
        database(),
        owner(r),
        parse(session, r.params).sessionId,
        action === 'cancel',
      );
    });
}
