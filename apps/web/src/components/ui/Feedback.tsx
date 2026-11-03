import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { AlertIcon, CheckIcon, CrossIcon, InfoIcon } from './icons';

export type FeedbackTone = 'success' | 'danger' | 'highlight' | 'info' | 'neutral';

const boxes: Record<FeedbackTone, string> = {
  success: 'border-success/35 bg-success-soft before:bg-success',
  danger: 'border-danger/35 bg-danger-soft before:bg-danger',
  highlight: 'border-on-highlight/25 bg-highlight before:bg-on-highlight',
  info: 'border-accent/25 bg-accent-soft before:bg-action',
  neutral: 'border-line bg-surface-sunken before:bg-line-strong',
};

// A filled disc with a glyph: the verdict is visible without reading the color.
const marks: Record<FeedbackTone, { className: string; glyph: ReactNode }> = {
  success: { className: 'bg-success', glyph: <CheckIcon strokeWidth={3} /> },
  danger: { className: 'bg-danger', glyph: <CrossIcon strokeWidth={3} /> },
  highlight: { className: 'bg-on-highlight', glyph: <AlertIcon strokeWidth={2.5} /> },
  info: { className: 'bg-action', glyph: <InfoIcon strokeWidth={2.5} /> },
  neutral: { className: 'bg-fg-muted', glyph: <InfoIcon strokeWidth={2.5} /> },
};

export interface FeedbackProps {
  tone: FeedbackTone;
  /** Short verdict in bold, e.g. "Doğru". */
  title?: ReactNode;
  children?: ReactNode;
  /** Plays the short settle animation (reduced motion: none). Key the element to replay it. */
  animate?: boolean | undefined;
  className?: string | undefined;
}

/**
 * Inline answer or result feedback. It has no live-region role of its own: place
 * it inside the page's persistent `role="status"` (or alert) element, so each new
 * verdict is announced once and the region never remounts.
 */
export function Feedback({ tone, title, children, animate = true, className }: FeedbackProps) {
  const mark = marks[tone];
  return (
    <div
      className={cn(
        // A slim accent bar on the leading edge repeats the tone; the disc's glyph carries it too.
        'relative flex items-start gap-3 overflow-hidden rounded-card border py-3.5 pr-4 pl-5 text-body text-fg',
        "before:absolute before:inset-y-0 before:left-0 before:w-1 before:content-['']",
        boxes[tone],
        animate && 'feedback-enter',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'mt-px grid size-6 shrink-0 place-items-center rounded-full text-[0.95rem] text-surface-raised shadow-[0_0_0_3px_rgb(255_255_255/0.6)]',
          mark.className,
        )}
      >
        {mark.glyph}
      </span>
      <div className="grid min-w-0 gap-1 wrap-anywhere">
        {title ? <p className="text-h4 text-fg">{title}</p> : null}
        {children}
      </div>
    </div>
  );
}
