import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { Button, Spinner } from './Button';
import { AlertIcon } from './icons';

export interface LoadingStateProps {
  /** The status text, announced once, e.g. "Listelerin yükleniyor…". */
  children: ReactNode;
  /** Number of placeholder rows drawn under the status (decorative). */
  rows?: number | undefined;
  className?: string | undefined;
}

/**
 * Loading status with an optional skeleton of the content to come. Only the text
 * is exposed to assistive technology; the placeholder shapes are hidden, and
 * they pulse only when the student has not asked for reduced motion.
 */
export function LoadingState({ children, rows = 0, className }: LoadingStateProps) {
  return (
    <div className={cn('grid gap-4', className)}>
      <p role="status" className="flex items-center gap-2.5 text-body font-medium text-fg">
        <span className="grid size-8 place-items-center rounded-full bg-accent-soft text-accent">
          <Spinner />
        </span>
        {children}
      </p>
      {rows > 0 ? (
        <div
          aria-hidden="true"
          className="grid gap-px overflow-hidden rounded-card border border-line bg-line shadow-card"
        >
          {Array.from({ length: rows }, (_, index) => (
            <div key={index} className="flex items-center gap-4 bg-surface-raised px-5 py-4">
              <span className="size-10 shrink-0 rounded-control bg-surface-sunken motion-safe:animate-pulse" />
              <span className="grid flex-1 gap-2">
                <span className="h-3.5 w-1/3 max-w-48 rounded-full bg-surface-sunken motion-safe:animate-pulse" />
                <span className="h-3 w-1/4 max-w-32 rounded-full bg-surface-sunken/70 motion-safe:animate-pulse" />
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export interface ErrorStateProps {
  /** The error message, shown in a role="alert" paragraph. */
  message: ReactNode;
  /** Shows "Tekrar dene" when given. */
  retry?: (() => void) | undefined;
  /** Further recovery actions (links to safe pages, reload buttons). */
  children?: ReactNode;
  className?: string | undefined;
}

/** Recoverable error: what happened, and what the student can do next. */
export function ErrorState({ message, retry, children, className }: ErrorStateProps) {
  return (
    <div
      className={cn(
        'grid justify-items-start gap-4 rounded-card border border-danger/30 bg-danger-soft p-5 shadow-card',
        className,
      )}
    >
      <p role="alert" className="flex items-start gap-3 text-body text-fg">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-raised text-[1.2rem] text-danger shadow-card">
          <AlertIcon />
        </span>
        <span className="min-w-0 self-center wrap-anywhere">{message}</span>
      </p>
      {retry || children ? (
        <div className="flex flex-wrap gap-3">
          {retry ? (
            <Button variant="secondary" onClick={retry}>
              Tekrar dene
            </Button>
          ) : null}
          {children}
        </div>
      ) : null}
    </div>
  );
}
