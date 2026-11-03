import { ApplicationError } from '../http/errors.js';

export const studyActions = ['known', 'missed', 'skip', 'remove'] as const;
export type StudyAction = (typeof studyActions)[number];
export type Outcome = 'KNOWN' | 'MISSED' | 'REMOVED';
export type SessionStatus = 'ACTIVE' | 'COMPLETED' | 'ENDED_EARLY';

export interface QueueCard {
  id: string;
  queueOrder: number;
  skipped: boolean;
  outcome: Outcome | null;
}

/** The next card to show: the unresolved card with the lowest queue order. */
export function currentCard<T extends QueueCard>(cards: readonly T[]): T | undefined {
  let current: T | undefined;
  for (const card of cards)
    if (card.outcome === null && (!current || card.queueOrder < current.queueOrder)) current = card;
  return current;
}

/**
 * First appearance: Bildim | Atla | Bilemedim. After one skip the card returns once
 * more with Bildim | Çıkar | Bilemedim; it can never be skipped twice or shown a
 * third time.
 */
export function allowedActions(card: Pick<QueueCard, 'skipped'>): StudyAction[] {
  return card.skipped ? ['known', 'remove', 'missed'] : ['known', 'skip', 'missed'];
}

const outcomes: Record<Exclude<StudyAction, 'skip'>, Outcome> = {
  known: 'KNOWN',
  missed: 'MISSED',
  remove: 'REMOVED',
};

export type ActionPlan =
  /** The same action was already applied (retry, double click, or another device). */
  | { type: 'replay' }
  | { type: 'skip'; queueOrder: number }
  | { type: 'resolve'; outcome: Outcome; completesSession: boolean };

/**
 * Decides what a card action does, from the locked, current session state.
 *
 * Order matters:
 * 1. An action that was already applied to this card is an idempotent replay, even if
 *    the session moved on or finished meanwhile; nothing is recorded twice.
 * 2. A different final outcome for an answered card is a conflict, never an overwrite.
 * 3. Otherwise the session must be active, the client must act on the current version
 *    (stale tabs are rejected), the card must be the current card, and the action must
 *    be allowed on this appearance.
 */
export function planAction(input: {
  status: SessionStatus;
  version: number;
  expectedVersion: number;
  cards: readonly QueueCard[];
  cardId: string;
  action: StudyAction;
}): ActionPlan {
  const { status, version, expectedVersion, cards, cardId, action } = input;
  const card = cards.find((candidate) => candidate.id === cardId);
  if (!card) throw new ApplicationError(404, 'STUDY_CARD_NOT_FOUND');

  if (action === 'skip') {
    // The skip already happened if the card is marked skipped and the client's view
    // predates it (or the card has since been resolved).
    if (card.skipped && (card.outcome !== null || expectedVersion !== version))
      return { type: 'replay' };
  } else if (card.outcome !== null) {
    if (card.outcome === outcomes[action]) return { type: 'replay' };
    throw new ApplicationError(409, 'STUDY_CARD_ALREADY_ANSWERED');
  }

  if (status !== 'ACTIVE') throw new ApplicationError(409, 'STUDY_SESSION_FINISHED');
  if (expectedVersion !== version) throw new ApplicationError(409, 'STUDY_SESSION_STALE');
  if (currentCard(cards)?.id !== card.id) throw new ApplicationError(409, 'STUDY_SESSION_STALE');
  if (!allowedActions(card).includes(action))
    throw new ApplicationError(409, 'STUDY_ACTION_NOT_ALLOWED');

  if (action === 'skip') {
    const last = Math.max(...cards.map((candidate) => candidate.queueOrder));
    return { type: 'skip', queueOrder: last + 1 };
  }
  const othersOpen = cards.some(
    (candidate) => candidate.id !== card.id && candidate.outcome === null,
  );
  return { type: 'resolve', outcome: outcomes[action], completesSession: !othersOpen };
}

/** Ending early: idempotent for a session that already ended early. */
export function planEnd(status: SessionStatus): 'end' | 'replay' {
  if (status === 'ACTIVE') return 'end';
  if (status === 'ENDED_EARLY') return 'replay';
  throw new ApplicationError(409, 'STUDY_SESSION_FINISHED');
}
