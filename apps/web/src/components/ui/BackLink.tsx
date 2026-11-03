import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { cn } from '../../lib/cn';
import { ArrowLeftIcon } from './icons';

export interface BackLinkProps {
  /** Fixed in-app destination (never history.back(): a direct visit has no app history). */
  to: string;
  children: ReactNode;
  className?: string;
}

/**
 * Quiet navigation control for returning to a parent page. The outline, padding
 * and leading arrow mark it as a control without relying on color, and it stays
 * visually below the page's primary actions (no fill, no shadow). 44px target.
 */
export function BackLink({ to, children, className }: BackLinkProps) {
  return (
    <Link
      to={to}
      className={cn(
        'group inline-flex min-h-11 items-center gap-2 justify-self-start rounded-control border border-line px-3.5 text-small font-semibold text-accent no-underline',
        'transition-[background-color,border-color,color] duration-(--duration-fast) ease-standard',
        // Tailwind's hover variant only applies on hover-capable pointers; active covers touch.
        'hover:border-accent hover:bg-accent-soft hover:text-on-accent-soft',
        'active:border-accent active:bg-accent-soft active:text-on-accent-soft',
        className,
      )}
    >
      <ArrowLeftIcon
        className={cn(
          'shrink-0 text-[1.25em] transition-transform duration-(--duration-base) ease-standard',
          'group-hover:-translate-x-0.5 motion-reduce:group-hover:translate-x-0',
        )}
      />
      <span>{children}</span>
    </Link>
  );
}
