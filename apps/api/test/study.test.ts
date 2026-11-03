import { describe, expect, it } from 'vitest';
import { ApplicationError } from '../src/http/errors.js';
import { applyEvaluation, initialProgress, type ProgressState } from '../src/study/progress.js';
import {
  allowedActions,
  currentCard,
  planAction,
  planEnd,
  type QueueCard,
} from '../src/study/queue.js';
import {
  selectSessionWords,
  sessionCardCount,
  shuffle,
  studyPercentages,
  type RandomInt,
} from '../src/study/selection.js';
import { sessionView, type StoredCard, type StoredSession } from '../src/study/view.js';

/** Deterministic random source (mulberry32) for reproducible selections. */
function seeded(seed: number): RandomInt {
  let state = seed >>> 0;
  return (maxExclusive) => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return Math.floor((((t ^ (t >>> 14)) >>> 0) / 4294967296) * maxExclusive);
  };
}
const words = (count: number, priority = 0) =>
  Array.from({ length: count }, (_, i) => ({ id: `w${i}`, needsReview: i < priority }));
function code(action: () => unknown): string {
  try {
    action();
  } catch (error) {
    if (error instanceof ApplicationError) return `${error.status} ${error.code}`;
    throw error;
  }
  throw new Error('expected an ApplicationError');
}

describe('session size', () => {
  it('offers exactly the four approved percentages', () => {
    expect(studyPercentages).toEqual([15, 25, 50, 100]);
  });

  it.each([
    [7, 15, 2],
    [10, 25, 3],
    [100, 15, 15],
    [150, 15, 23],
    [10, 15, 2],
    [10, 50, 5],
    [10, 100, 10],
    [7, 25, 2],
    [7, 50, 4],
    [7, 100, 7],
    [1, 15, 1],
    [3, 50, 2],
    [20, 15, 3],
    [0, 100, 0],
  ] as const)(
    '%i words at %i%% -> %i cards (rounded up, never above the list)',
    (total, pct, n) => {
      expect(sessionCardCount(total, pct)).toBe(n);
    },
  );

  it('never exceeds the list for any size and percentage', () => {
    for (let total = 0; total <= 300; total++)
      for (const pct of studyPercentages) {
        const count = sessionCardCount(total, pct);
        expect(count).toBeLessThanOrEqual(total);
        expect(count).toBe(Math.ceil((total * pct) / 100));
      }
  });
});

describe('selection and review priority', () => {
  it('shuffles without losing or duplicating items', () => {
    const items = Array.from({ length: 50 }, (_, i) => i);
    const result = shuffle(items, seeded(1));
    expect(result).not.toEqual(items);
    expect([...result].sort((a, b) => a - b)).toEqual(items);
  });

  it('selects the right number of distinct words', () => {
    for (const pct of studyPercentages) {
      const ids = selectSessionWords(words(37), pct, seeded(pct));
      expect(ids).toHaveLength(sessionCardCount(37, pct));
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('ignores duplicate candidates', () => {
    const ids = selectSessionWords([...words(4), ...words(4)], 100, seeded(3));
    expect(ids.sort()).toEqual(['w0', 'w1', 'w2', 'w3']);
  });

  it('takes every priority word first and fills the rest randomly (100 words, 15%, 8 missed)', () => {
    for (let seed = 0; seed < 25; seed++) {
      const ids = selectSessionWords(words(100, 8), 15, seeded(seed));
      expect(ids).toHaveLength(15);
      for (let i = 0; i < 8; i++) expect(ids).toContain(`w${i}`);
      expect(new Set(ids).size).toBe(15);
    }
  });

  it('chooses randomly among priority words when they exceed capacity', () => {
    const seen = new Set<string>();
    for (let seed = 0; seed < 25; seed++) {
      const ids = selectSessionWords(words(100, 30), 15, seeded(seed));
      expect(ids).toHaveLength(15);
      expect(ids.every((id) => Number(id.slice(1)) < 30)).toBe(true);
      ids.forEach((id) => seen.add(id));
    }
    expect(seen.size).toBeGreaterThan(15);
  });

  it('does not present priority words first: the final selection is shuffled', () => {
    const firstIsOther = Array.from({ length: 30 }, (_, seed) =>
      selectSessionWords(words(20, 2), 25, seeded(seed)),
    ).some((ids) => !['w0', 'w1'].includes(ids[0]!));
    expect(firstIsOther).toBe(true);
  });

  it('varies between sessions', () => {
    const orders = new Set(
      Array.from({ length: 10 }, (_, seed) =>
        selectSessionWords(words(10), 100, seeded(seed)).join(),
      ),
    );
    expect(orders.size).toBeGreaterThan(1);
  });
});

describe('shared learning progress', () => {
  const run = (results: ('known' | 'missed')[], from: ProgressState = initialProgress) =>
    results.reduce(applyEvaluation, from);

  it('Bilemedim -> Bildim -> Bildim clears priority only after the second Bildim', () => {
    const missed = run(['missed']);
    expect(missed).toEqual({ needsReview: true, knownStreak: 0 });
    const once = applyEvaluation(missed, 'known');
    expect(once).toEqual({ needsReview: true, knownStreak: 1 });
    expect(applyEvaluation(once, 'known')).toEqual({ needsReview: false, knownStreak: 2 });
  });

  it('a Bilemedim at any point resets the streak and enables priority again', () => {
    expect(run(['missed', 'known', 'missed'])).toEqual({ needsReview: true, knownStreak: 0 });
    expect(run(['known', 'known', 'known', 'missed'])).toEqual({
      needsReview: true,
      knownStreak: 0,
    });
    expect(run(['missed', 'known', 'missed', 'known', 'known'])).toEqual({
      needsReview: false,
      knownStreak: 2,
    });
  });

  it('a never-missed word never needs review', () => {
    expect(run(['known'])).toEqual({ needsReview: false, knownStreak: 1 });
  });
});

describe('card queue decisions', () => {
  const card = (id: string, queueOrder: number, extra: Partial<QueueCard> = {}): QueueCard => ({
    id,
    queueOrder,
    skipped: false,
    outcome: null,
    ...extra,
  });
  const base = {
    status: 'ACTIVE' as const,
    version: 3,
    expectedVersion: 3,
    cards: [card('a', 0, { outcome: 'KNOWN' }), card('b', 1), card('c', 2)],
  };

  it('the current card is the unresolved card with the lowest queue order', () => {
    expect(currentCard(base.cards)?.id).toBe('b');
    expect(currentCard([card('x', 5, { skipped: true }), card('y', 2)])?.id).toBe('y');
    expect(currentCard([card('x', 0, { outcome: 'MISSED' })])).toBeUndefined();
  });

  it('offers Atla first and Çıkar on the second appearance', () => {
    expect(allowedActions({ skipped: false })).toEqual(['known', 'skip', 'missed']);
    expect(allowedActions({ skipped: true })).toEqual(['known', 'remove', 'missed']);
  });

  it('records Known/Missed for the current card and detects the last card', () => {
    expect(planAction({ ...base, cardId: 'b', action: 'known' })).toEqual({
      type: 'resolve',
      outcome: 'KNOWN',
      completesSession: false,
    });
    const last = { ...base, cards: [card('a', 0, { outcome: 'KNOWN' }), card('c', 2)] };
    expect(planAction({ ...last, cardId: 'c', action: 'missed' })).toEqual({
      type: 'resolve',
      outcome: 'MISSED',
      completesSession: true,
    });
  });

  it('moves a first skip behind every other card; the skipped card can then be removed', () => {
    expect(planAction({ ...base, cardId: 'b', action: 'skip' })).toEqual({
      type: 'skip',
      queueOrder: 3,
    });
    const returned = { ...base, cards: [card('b', 3, { skipped: true })] };
    expect(code(() => planAction({ ...returned, cardId: 'b', action: 'skip' }))).toBe(
      '409 STUDY_ACTION_NOT_ALLOWED',
    );
    expect(planAction({ ...returned, cardId: 'b', action: 'remove' })).toEqual({
      type: 'resolve',
      outcome: 'REMOVED',
      completesSession: true,
    });
  });

  it('allows Çıkar only on the second appearance', () => {
    expect(code(() => planAction({ ...base, cardId: 'b', action: 'remove' }))).toBe(
      '409 STUDY_ACTION_NOT_ALLOWED',
    );
  });

  it('replays an identical action instead of recording it twice', () => {
    const answered = {
      ...base,
      version: 4,
      cards: [card('b', 1, { outcome: 'KNOWN' }), card('c', 2)],
    };
    expect(planAction({ ...answered, cardId: 'b', action: 'known' })).toEqual({ type: 'replay' });
    // Still a replay once the session has finished.
    expect(planAction({ ...answered, status: 'COMPLETED', cardId: 'b', action: 'known' })).toEqual({
      type: 'replay',
    });
    const skipped = { ...base, version: 4, cards: [card('b', 3, { skipped: true }), card('c', 2)] };
    expect(planAction({ ...skipped, cardId: 'b', action: 'skip' })).toEqual({ type: 'replay' });
  });

  it('rejects a conflicting outcome for an answered card', () => {
    const answered = { ...base, version: 4, cards: [card('b', 1, { outcome: 'KNOWN' })] };
    expect(code(() => planAction({ ...answered, cardId: 'b', action: 'missed' }))).toBe(
      '409 STUDY_CARD_ALREADY_ANSWERED',
    );
    expect(code(() => planAction({ ...answered, cardId: 'b', action: 'remove' }))).toBe(
      '409 STUDY_CARD_ALREADY_ANSWERED',
    );
  });

  it('rejects stale versions, non-current cards, finished sessions and unknown cards', () => {
    expect(
      code(() => planAction({ ...base, expectedVersion: 2, cardId: 'b', action: 'known' })),
    ).toBe('409 STUDY_SESSION_STALE');
    expect(code(() => planAction({ ...base, cardId: 'c', action: 'known' }))).toBe(
      '409 STUDY_SESSION_STALE',
    );
    expect(
      code(() => planAction({ ...base, status: 'ENDED_EARLY', cardId: 'b', action: 'known' })),
    ).toBe('409 STUDY_SESSION_FINISHED');
    expect(code(() => planAction({ ...base, cardId: 'zzz', action: 'known' }))).toBe(
      '404 STUDY_CARD_NOT_FOUND',
    );
  });

  it('ends early idempotently, but not a completed session', () => {
    expect(planEnd('ACTIVE')).toBe('end');
    expect(planEnd('ENDED_EARLY')).toBe('replay');
    expect(code(() => planEnd('COMPLETED'))).toBe('409 STUDY_SESSION_FINISHED');
  });
});

describe('session view', () => {
  const session: StoredSession = {
    id: 's',
    wordListId: 'l',
    listTitle: 'Algorithms',
    direction: 'TR_EN',
    percentage: 100,
    cardCount: 3,
    status: 'ACTIVE',
    version: 2,
    startedAt: new Date('2026-10-22T10:00:00Z'),
    finishedAt: null,
  };
  const stored = (id: string, position: number, extra: Partial<StoredCard> = {}): StoredCard => ({
    id,
    wordId: `w-${id}`,
    english: `english-${id}`,
    meanings: [`anlam-${id}-1`, `anlam-${id}-2`, `anlam-${id}-3`],
    position,
    queueOrder: position,
    skipped: false,
    outcome: null,
    answeredAt: null,
    ...extra,
  });

  it('TR→EN shows every Turkish meaning on the front and the English text as the answer', () => {
    const view = sessionView(session, [stored('a', 0)]);
    expect(view.direction).toBe('tr-en');
    expect(view.currentCard).toMatchObject({
      id: 'a',
      appearance: 1,
      front: ['anlam-a-1', 'anlam-a-2', 'anlam-a-3'],
      back: ['english-a'],
      allowedActions: ['known', 'skip', 'missed'],
    });
  });

  it('EN→TR shows the English text and answers with every meaning', () => {
    const view = sessionView({ ...session, direction: 'EN_TR' }, [stored('a', 0)]);
    expect(view.currentCard).toMatchObject({
      front: ['english-a'],
      back: ['anlam-a-1', 'anlam-a-2', 'anlam-a-3'],
    });
  });

  it('counts outcomes, keeps snapshot order and marks the second appearance', () => {
    const view = sessionView(session, [
      stored('c', 2, { queueOrder: 3, skipped: true }),
      stored('a', 0, { outcome: 'KNOWN', answeredAt: new Date('2026-10-22T10:01:00Z') }),
      stored('b', 1, { outcome: 'MISSED', answeredAt: new Date('2026-10-22T10:02:00Z') }),
    ]);
    expect(view.cards.map((card) => card.id)).toEqual(['a', 'b', 'c']);
    expect(view.cards.map((card) => card.outcome)).toEqual(['known', 'missed', null]);
    expect(view.counts).toEqual({ total: 3, known: 1, missed: 1, removed: 0, unanswered: 1 });
    expect(view.currentCard).toMatchObject({
      id: 'c',
      appearance: 2,
      allowedActions: ['known', 'remove', 'missed'],
    });
  });

  it('has no current card once the session is finished, even with unanswered cards', () => {
    const view = sessionView({ ...session, status: 'ENDED_EARLY', finishedAt: new Date() }, [
      stored('a', 0),
    ]);
    expect(view.status).toBe('ended_early');
    expect(view.currentCard).toBeNull();
    expect(view.counts.unanswered).toBe(1);
  });
});
