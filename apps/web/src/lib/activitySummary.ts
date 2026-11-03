import type { Activity } from './activity';
import { historyGameNames } from './games';

// Presentation helpers for saved activities (dashboard and history). They only
// read what the API returned; no outcome is recalculated or reinterpreted here.

export type ActivityMode =
  | 'flashcards'
  | 'written'
  | 'listening'
  | 'mixed'
  | 'quiz'
  | 'matching'
  | 'assembly'
  | 'memory'
  | 'word-search'
  | 'crossword';

export function activityMode(activity: Activity): ActivityMode {
  if (activity.kind === 'flashcard') return 'flashcards';
  const type = activity.game.gameType;
  if (type === 'written-recall') return 'written';
  return type;
}

export function activityName(activity: Activity): string {
  return activity.kind === 'flashcard'
    ? 'Kelime kartları'
    : historyGameNames[activity.game.gameType];
}

export function activityListTitle(activity: Activity): string {
  return activity.kind === 'flashcard' ? activity.session.listTitle : activity.game.listTitle;
}

/** One short line of the student's own outcome; never points or ranks. */
export function activityOutcome(activity: Activity): string {
  if (activity.kind === 'flashcard') {
    const { known, total } = activity.session.counts;
    return `${known} / ${total} kart Bildim`;
  }
  const { gameType, items } = activity.game;
  if (['written-recall', 'listening', 'quiz', 'assembly'].includes(gameType)) {
    const correct = items.filter((item) => item.outcome === 'correct').length;
    return `${correct} / ${items.length} doğru`;
  }
  if (gameType === 'mixed') return `${items.length} soru`;
  return `${items.length} kelime`;
}

/** The saved result page of an activity, when one exists. */
export function activityResultPath(activity: Activity): string | null {
  if (activity.kind === 'flashcard') return `/study/sessions/${activity.session.id}/summary`;
  const first = activity.game.items[0];
  if (activity.game.gameType === 'mixed' && first?.practiceSessionId)
    return `/study/practice/${first.practiceSessionId}`;
  if (['word-search', 'crossword'].includes(activity.game.gameType) && first?.puzzleSessionId)
    return `/games/puzzles/${first.puzzleSessionId}`;
  return null;
}

/** YYYY-MM-DD in local time (toISOString would give the UTC date). */
export function localDayKey(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

const timeFormat = new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit' });
const dayFormat = new Intl.DateTimeFormat('tr-TR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});
const shortDayFormat = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short' });

/** "Bugün", "Dün" or the full date, for day group headings. */
export function dayLabel(date: Date, now: Date = new Date()): string {
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (localDayKey(date) === localDayKey(now)) return 'Bugün';
  if (localDayKey(date) === localDayKey(yesterday)) return 'Dün';
  return dayFormat.format(date);
}

/** Compact time stamp: "Bugün 14:05", "Dün 09:30" or "23 Eki 18:12". */
export function shortStamp(date: Date, now: Date = new Date()): string {
  const day = dayLabel(date, now);
  const prefix = day === 'Bugün' || day === 'Dün' ? day : shortDayFormat.format(date);
  return `${prefix} ${timeFormat.format(date)}`;
}

export function timeOfDay(date: Date): string {
  return timeFormat.format(date);
}
