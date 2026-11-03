import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

export interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  description: ReactNode;
  /** Primary and optional secondary actions. */
  actions?: ReactNode;
  headingLevel?: 'h1' | 'h2' | 'h3' | 'h4';
  className?: string | undefined;
}

/** A blank sheet with one clear next step; used where content will appear later. */
export function EmptyState({
  icon,
  title,
  description,
  actions,
  headingLevel: Heading = 'h3',
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'relative isolate flex flex-col items-center overflow-hidden rounded-panel border border-dashed border-line-strong/60 bg-surface-raised px-6 py-10 text-center sm:py-14',
        className,
      )}
    >
      {/* A soft light and a dot grid behind the icon. Decorative only. */}
      <span
        aria-hidden="true"
        className="dot-grid pointer-events-none absolute inset-0 -z-10 [mask-image:radial-gradient(22rem_12rem_at_50%_0%,#000,transparent_75%)]"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-40 bg-[radial-gradient(18rem_9rem_at_50%_0%,rgb(59_130_246/0.14),transparent_70%)]"
      />
      <span
        aria-hidden="true"
        className="relative mb-5 grid size-16 place-items-center rounded-[1.25rem] bg-[linear-gradient(140deg,#3b82f6,#1262b0_60%,#4338ca)] text-[1.8rem] text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.25),0_14px_28px_-12px_rgb(18_98_176/0.7)]"
      >
        {icon}
      </span>
      <Heading className="text-h3 text-fg">{title}</Heading>
      <p className="mt-2 max-w-md text-body text-fg-muted">{description}</p>
      {actions ? <div className="mt-7 flex flex-wrap justify-center gap-3">{actions}</div> : null}
    </div>
  );
}
