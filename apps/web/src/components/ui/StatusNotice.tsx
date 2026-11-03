import { cn } from '../../lib/cn';
import { CheckIcon } from './icons';

export interface StatusNoticeProps {
  /** Success message; an empty string shows nothing. */
  message: string;
  className?: string;
}

/**
 * Inline success status for completed operations (no toast, no auto-dismiss).
 *
 * The role="status" region is always mounted, so screen readers announce each
 * new message once when it is inserted. The visible box is keyed by its text: a
 * new message mounts a fresh box, which plays the short `.fade-in` (opacity
 * only). The box sits in a fixed place in the page, below the header.
 */
export function StatusNotice({ message, className }: StatusNoticeProps) {
  return (
    // Keep the live region mounted, but out of grid flow until it has a message.
    <div role="status" className={cn(className, !message && 'sr-only')}>
      {message ? (
        <p
          key={message}
          className="fade-in flex items-start gap-3 rounded-card border border-success/35 bg-success-soft px-4 py-3 text-body text-fg shadow-card"
        >
          {/* The icon is a second, non-color cue; the text carries the meaning. */}
          <CheckIcon className="mt-0.5 shrink-0 text-[1.25rem] text-success" />
          <span className="min-w-0 wrap-anywhere">{message}</span>
        </p>
      ) : null}
    </div>
  );
}
