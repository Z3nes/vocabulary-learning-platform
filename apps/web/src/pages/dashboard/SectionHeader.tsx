import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { ArrowRightIcon } from '../../components/ui/icons';

export interface SectionHeaderProps {
  /** Id of the <h2>, referenced by the section's aria-labelledby. */
  id: string;
  title: string;
  description?: ReactNode;
  /** Optional link on the right, e.g. <SectionLink>. */
  action?: ReactNode;
}

export function SectionHeader({ id, title, description, action }: SectionHeaderProps) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="grid max-w-2xl gap-1.5">
        <h2 id={id} className="text-h2 text-fg">
          {title}
        </h2>
        {description ? <p className="text-body text-fg-muted">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

/** Pill link with a sliding arrow, for "go to section" navigation. */
export function SectionLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      className="group inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border border-line bg-surface-raised px-4 text-small font-semibold no-underline shadow-card transition-[border-color,background-color] duration-(--duration-fast) ease-standard hover:border-accent hover:bg-accent-soft hover:text-on-accent-soft"
    >
      {children}
      <ArrowRightIcon className="transition-transform duration-(--duration-base) ease-standard group-hover:translate-x-0.5 motion-reduce:group-hover:translate-x-0" />
    </Link>
  );
}
