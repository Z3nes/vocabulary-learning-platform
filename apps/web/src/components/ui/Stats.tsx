import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

export type StatTone = 'neutral' | 'success' | 'highlight' | 'danger' | 'info';

const markers: Record<StatTone, string> = {
  neutral: 'bg-line-strong',
  success: 'bg-success',
  highlight: 'bg-on-highlight',
  danger: 'bg-danger',
  info: 'bg-action',
};

export interface StatItem {
  label: string;
  value: ReactNode;
  tone?: StatTone | undefined;
}

export interface StatGridProps {
  /** Accessible name of the list, e.g. "Sonuç sayıları". */
  label: string;
  items: StatItem[];
  className?: string | undefined;
}

/**
 * Personal outcome counts (never points or ranks). The label comes first in the
 * DOM, so it is read before the number; the number is shown above it visually.
 */
export function StatGrid({ label, items, className }: StatGridProps) {
  return (
    // Results can sit beside a medallion or inside a narrow column. Size the
    // grid from its own container, rather than from the browser viewport.
    <div className="@container/stats min-w-0">
      <ul
        aria-label={label}
        className={cn(
          'grid grid-cols-1 gap-3 @min-[18rem]/stats:grid-cols-2',
          items.length >= 4
            ? '@2xl/stats:grid-cols-4'
            : items.length === 3
              ? '@lg/stats:grid-cols-3'
              : '',
          className,
        )}
      >
        {items.map((item) => (
          <li
            key={item.label}
            className="relative flex min-w-0 flex-col-reverse justify-end gap-1.5 overflow-hidden rounded-card border border-line bg-surface-raised px-4 pt-4 pb-3.5 shadow-card"
          >
            <span className="flex min-w-0 items-start gap-2 text-small font-semibold text-fg-muted">
              <span
                aria-hidden="true"
                className={cn(
                  'mt-1.5 size-2.5 shrink-0 rounded-full ring-4 ring-surface-sunken',
                  markers[item.tone ?? 'neutral'],
                )}
              />
              <span className="min-w-0 wrap-anywhere">{item.label}</span>
            </span>
            <span className="wrap-anywhere text-h1 text-fg tabular-nums">{item.value}</span>
            {/* Decorative accent along the top edge, in the stat's tone. */}
            <span
              aria-hidden="true"
              className={cn(
                'absolute inset-x-0 top-0 h-1 opacity-80',
                markers[item.tone ?? 'neutral'],
              )}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
