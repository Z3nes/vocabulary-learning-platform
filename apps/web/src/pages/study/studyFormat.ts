import {
  directionLabels,
  type CurrentCard,
  type StudyAction,
  type StudySession,
} from '../../lib/study';

// Pure helpers shared by the study pages (kept out of component files).

export const studyPaths = {
  setup: (listId: string | null) =>
    listId ? `/lists/${encodeURIComponent(listId)}/study` : '/study/review',
  session: (sessionId: string) => `/study/sessions/${encodeURIComponent(sessionId)}`,
  summary: (sessionId: string) => `/study/sessions/${encodeURIComponent(sessionId)}/summary`,
  list: (listId: string | null) =>
    listId ? `/lists/${encodeURIComponent(listId)}` : '/study/review',
};

/** Turkish percent notation: "%25". */
export const percentLabel = (percentage: number) => `%${percentage}`;

const dateTime = new Intl.DateTimeFormat('tr-TR', { dateStyle: 'medium', timeStyle: 'short' });
export const formatDateTime = (value: string) => dateTime.format(new Date(value));

/** "İngilizce → Türkçe · %25 · 7 kart" */
export function sessionFacts(session: Pick<StudySession, 'direction' | 'percentage' | 'counts'>) {
  return `${directionLabels[session.direction]} · ${percentLabel(session.percentage)} · ${session.counts.total} kart`;
}

/** Fixed product order, independent of screen width: Bildim | Atla/Çıkar | Bilemedim. */
export function actionSlots(card: Pick<CurrentCard, 'allowedActions'>) {
  const middle: StudyAction = card.allowedActions.includes('remove') ? 'remove' : 'skip';
  return [
    { slot: 'left', action: 'known' },
    { slot: 'middle', action: middle },
    { slot: 'right', action: 'missed' },
  ] as const satisfies readonly { slot: string; action: StudyAction }[];
}
