import type { ReactNode } from 'react';
import { Spinner } from '../../components/ui/Button';
import { ProgressBar } from '../../components/ui/Progress';
import { CheckIcon, CrossIcon, RemoveIcon, SkipIcon } from '../../components/ui/icons';
import { cn } from '../../lib/cn';
import { actionSlots } from './studyFormat';
import {
  resolvedCount,
  type CurrentCard,
  type StudyAction,
  type StudySession,
} from '../../lib/study';

const actionMeta: Record<StudyAction, { label: string; icon: ReactNode; tone: string }> = {
  known: {
    label: 'Bildim',
    icon: <CheckIcon />,
    tone:
      'border-success/50 bg-success-soft text-success ' +
      'not-aria-disabled:hover:border-success not-aria-disabled:hover:shadow-raised',
  },
  skip: {
    label: 'Atla',
    icon: <SkipIcon />,
    tone:
      'border-line-strong/70 bg-surface-raised text-fg ' +
      'not-aria-disabled:hover:border-accent not-aria-disabled:hover:bg-accent-soft not-aria-disabled:hover:text-on-accent-soft not-aria-disabled:hover:shadow-raised',
  },
  remove: {
    label: 'Çıkar',
    icon: <RemoveIcon />,
    tone:
      'border-line-strong/70 bg-surface-raised text-fg ' +
      'not-aria-disabled:hover:border-accent not-aria-disabled:hover:bg-accent-soft not-aria-disabled:hover:text-on-accent-soft not-aria-disabled:hover:shadow-raised',
  },
  missed: {
    label: 'Bilemedim',
    icon: <CrossIcon />,
    // Amber, not red: not knowing a word yet is a learning signal, not an error.
    tone:
      'border-on-highlight/35 bg-highlight text-on-highlight ' +
      'not-aria-disabled:hover:border-on-highlight not-aria-disabled:hover:shadow-raised',
  },
};

/**
 * The three evaluation buttons. Buttons are keyed by slot, so the focused element
 * survives a card change (focus is never moved). While a request is pending, or while
 * an uncertain request awaits a retry, every button stays focusable but ignores
 * activation (aria-disabled): disabling them would drop keyboard focus.
 */
export function StudyActions({
  card,
  pending,
  locked,
  act,
}: {
  card: CurrentCard;
  /** The action whose request is in flight. */
  pending: StudyAction | null;
  locked: boolean;
  act: (action: StudyAction) => void;
}) {
  const inert = locked || pending !== null;
  return (
    <div role="group" aria-label="Kartı değerlendir" className="grid grid-cols-3 gap-2 sm:gap-3">
      {actionSlots(card).map(({ slot, action }) => {
        const meta = actionMeta[action];
        const busy = pending === action;
        return (
          <button
            key={slot}
            type="button"
            data-action={action}
            aria-disabled={inert || undefined}
            aria-busy={busy || undefined}
            onClick={() => {
              if (!inert && card.allowedActions.includes(action)) act(action);
            }}
            className={cn(
              'inline-flex min-h-18 min-w-0 flex-col items-center justify-center gap-1.5 rounded-card border-2 px-2 py-2.5 shadow-card',
              'text-body font-semibold sm:min-h-16 sm:flex-row sm:gap-2.5 sm:px-4',
              'transition-[background-color,border-color,color,box-shadow] duration-(--duration-fast) ease-standard',
              // A pending request keeps the colors (no grey flash on every card); only
              // a request awaiting a retry shows the buttons as unavailable.
              locked
                ? 'cursor-not-allowed border-transparent bg-disabled text-on-disabled'
                : meta.tone,
              pending !== null && 'cursor-progress',
            )}
          >
            {/* The glyph sits in a soft disc of the button's own color. */}
            <span
              aria-hidden="true"
              className="grid size-8 shrink-0 place-items-center rounded-full bg-current/12 text-[1.1em]"
            >
              {busy ? <Spinner /> : meta.icon}
            </span>
            <span className="wrap-anywhere">{meta.label}</span>
            {busy ? <span className="sr-only">(kaydediliyor)</span> : null}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Completed = cards with a final outcome. A skipped card is still open until its
 * second appearance is answered, so the count can never exceed the total.
 */
export function StudyProgress({ session }: { session: StudySession }) {
  const { counts } = session;
  const done = resolvedCount(counts);
  const text = `Tamamlanan ${done} / ${counts.total}`;
  return (
    <div className="grid gap-2.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-body font-semibold text-fg tabular-nums">{text}</p>
        <p className="text-small text-fg-muted tabular-nums">
          Bildim {counts.known} · Bilemedim {counts.missed} · Çıkarılan {counts.removed}
        </p>
      </div>
      <ProgressBar
        label="Çalışma ilerlemesi"
        value={done}
        max={counts.total}
        valueText={text}
        tone="mode"
      />
    </div>
  );
}
