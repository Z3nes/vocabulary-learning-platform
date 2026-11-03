import { z } from 'zod';

const text = (max: number) => z.string().min(1).max(max);
export const resultItemSchema = z
  .object({
    wordId: z.uuid().nullable(),
    english: text(120),
    // Keep all saved meanings; the route's 256 KiB body limit bounds transport.
    meanings: z.array(text(160)).min(1),
    outcome: z.enum(['correct', 'incorrect', 'revealed', 'matched']),
    attempts: z.int().min(0).max(10000),
  })
  .strict();
export const completionSchema = z
  .object({
    completionId: z.uuid(),
    listId: z.uuid(),
    gameType: z.enum(['quiz', 'matching', 'assembly', 'memory']),
    status: z.literal('completed'),
    items: z.array(resultItemSchema).min(1).max(10),
  })
  .strict()
  .superRefine((value, context) => {
    const limits = { quiz: [1, 10], matching: [2, 5], assembly: [1, 8], memory: [2, 6] } as const;
    const [min, max] = limits[value.gameType];
    const outcomes =
      value.gameType === 'quiz'
        ? ['correct', 'incorrect']
        : value.gameType === 'assembly'
          ? ['correct', 'revealed']
          : ['matched'];
    const ids = value.items.flatMap((item) => (item.wordId ? [item.wordId] : []));
    if (
      value.items.length < min ||
      value.items.length > max ||
      value.items.some(
        (item) =>
          !outcomes.includes(item.outcome) || (item.outcome !== 'revealed' && item.attempts < 1),
      ) ||
      new Set(ids).size !== ids.length
    )
      context.addIssue({ code: 'custom', message: 'Invalid completed game' });
  });
export type CompletionInput = z.infer<typeof completionSchema>;
