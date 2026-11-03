import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Wordmark } from '../ui/Wordmark';

export function SkipLink({ targetId = 'main' }: { targetId?: string }) {
  return (
    <a
      href={`#${targetId}`}
      className="fixed top-3 left-3 z-50 -translate-y-24 rounded-control bg-action px-4 py-2 font-semibold text-on-action no-underline shadow-overlay transition-transform duration-(--duration-base) ease-standard focus-visible:translate-y-0 hover:text-on-action"
    >
      Ana içeriğe geç
    </a>
  );
}

/** Institutional navy header. `children` renders on the right (e.g. status badges). */
export function AppHeader({ children }: { children?: ReactNode }) {
  return (
    <header data-surface="navy" className="border-b border-line">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-3.5 sm:px-6">
        <Link to="/" className="rounded-control no-underline" aria-label="Ana sayfa">
          <Wordmark />
        </Link>
        {children}
      </div>
    </header>
  );
}
