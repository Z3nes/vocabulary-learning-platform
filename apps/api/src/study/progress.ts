/** Shared, direction-independent learning state of one word. */
export interface ProgressState {
  needsReview: boolean;
  /** Consecutive KNOWN results since the last MISSED (or since tracking began). */
  knownStreak: number;
}

export type EvaluationResult = 'known' | 'missed';

/** KNOWN results in a row (each from a separate session) that clear review priority. */
export const knownStreakToClearReview = 2;

export const initialProgress: ProgressState = { needsReview: false, knownStreak: 0 };

/**
 * Applies one KNOWN or MISSED evaluation. Skips and removals never reach this function:
 * they are not evaluations and leave progress unchanged.
 *
 * - MISSED: review priority on, streak reset (at any time, also for learned words).
 * - KNOWN: streak + 1; priority clears once the streak reaches two.
 *
 * "Separate sessions" holds by construction: a word appears at most once per session
 * (unique sessionId + wordId) and each card gets at most one outcome.
 */
export function applyEvaluation(state: ProgressState, result: EvaluationResult): ProgressState {
  if (result === 'missed') return { needsReview: true, knownStreak: 0 };
  const knownStreak = state.knownStreak + 1;
  return {
    needsReview: state.needsReview && knownStreak < knownStreakToClearReview,
    knownStreak,
  };
}
