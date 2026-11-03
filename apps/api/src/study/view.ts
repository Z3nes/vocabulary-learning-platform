import { allowedActions, currentCard, type Outcome, type SessionStatus } from './queue.js';

export type DirectionCode = 'EN_TR' | 'TR_EN';
export const directionToApi = { EN_TR: 'en-tr', TR_EN: 'tr-en' } as const;
export const directionFromApi = { 'en-tr': 'EN_TR', 'tr-en': 'TR_EN' } as const;
const statusToApi = {
  ACTIVE: 'active',
  COMPLETED: 'completed',
  ENDED_EARLY: 'ended_early',
} as const;
const outcomeToApi = { KNOWN: 'known', MISSED: 'missed', REMOVED: 'removed' } as const;

export interface StoredCard {
  id: string;
  wordId: string | null;
  english: string;
  meanings: string[];
  position: number;
  queueOrder: number;
  skipped: boolean;
  outcome: Outcome | null;
  answeredAt: Date | null;
  originListId?: string | null;
  originListTitle?: string | null;
}

export interface StoredSession {
  id: string;
  wordListId: string | null;
  reviewOnly?: boolean;
  listTitle: string;
  direction: DirectionCode;
  percentage: number;
  cardCount: number;
  status: SessionStatus;
  version: number;
  startedAt: Date;
  finishedAt: Date | null;
}

/** Fields to read for a full session view (Prisma `select`). */
export const sessionSelection = {
  id: true,
  wordListId: true,
  listTitle: true,
  direction: true,
  percentage: true,
  cardCount: true,
  status: true,
  version: true,
  startedAt: true,
  finishedAt: true,
  reviewOnly: true,
  eligibleCount: true,
} as const;

export const cardSelection = {
  id: true,
  wordId: true,
  english: true,
  meanings: true,
  position: true,
  queueOrder: true,
  skipped: true,
  outcome: true,
  answeredAt: true,
  originListId: true,
  originListTitle: true,
} as const;

export function sessionCounts(cards: readonly Pick<StoredCard, 'outcome'>[]) {
  const count = (outcome: Outcome | null) =>
    cards.filter((card) => card.outcome === outcome).length;
  return {
    total: cards.length,
    known: count('KNOWN'),
    missed: count('MISSED'),
    removed: count('REMOVED'),
    /** Not yet resolved, including skipped cards waiting for their second appearance. */
    unanswered: count(null),
  };
}

function summary(session: StoredSession, cards: readonly Pick<StoredCard, 'outcome'>[]) {
  return {
    id: session.id,
    listId: session.wordListId,
    reviewOnly: session.reviewOnly ?? false,
    listTitle: session.listTitle,
    direction: directionToApi[session.direction],
    percentage: session.percentage,
    status: statusToApi[session.status],
    version: session.version,
    startedAt: session.startedAt.toISOString(),
    finishedAt: session.finishedAt?.toISOString() ?? null,
    counts: sessionCounts(cards),
  };
}

/** History row: summary metadata and counts, without card snapshots. */
export function sessionSummaryView(
  session: StoredSession,
  cards: readonly Pick<StoredCard, 'outcome'>[],
) {
  return summary(session, cards);
}

/**
 * Full session for studying and for the result screen. `currentCard` already applies
 * the direction: EN→TR shows the English text and answers with every Turkish meaning;
 * TR→EN shows every Turkish meaning together and answers with the English text.
 * Revealing the answer is purely visual and needs no request.
 */
export function sessionView(session: StoredSession, cards: readonly StoredCard[]) {
  const ordered = [...cards].sort((a, b) => a.position - b.position);
  const current = session.status === 'ACTIVE' ? currentCard(ordered) : undefined;
  const englishFirst = session.direction === 'EN_TR';
  return {
    ...summary(session, ordered),
    currentCard: current
      ? {
          id: current.id,
          originListId: current.originListId ?? null,
          originListTitle: current.originListTitle ?? null,
          /** 1 on the first appearance, 2 after one skip (Çıkar is then offered). */
          appearance: current.skipped ? 2 : 1,
          front: englishFirst ? [current.english] : current.meanings,
          back: englishFirst ? current.meanings : [current.english],
          allowedActions: allowedActions(current),
        }
      : null,
    cards: ordered.map((card) => ({
      id: card.id,
      /** Null when the word was deleted after the session started; the snapshot remains. */
      wordId: card.wordId,
      english: card.english,
      meanings: card.meanings,
      position: card.position,
      originListId: card.originListId ?? null,
      originListTitle: card.originListTitle ?? null,
      skipped: card.skipped,
      outcome: card.outcome ? outcomeToApi[card.outcome] : null,
      answeredAt: card.answeredAt?.toISOString() ?? null,
    })),
  };
}

export type SessionView = ReturnType<typeof sessionView>;
