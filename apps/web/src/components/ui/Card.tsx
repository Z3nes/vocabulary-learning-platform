import type { AnchorHTMLAttributes, HTMLAttributes, ReactNode } from 'react';
import { Link } from 'react-router';
import { cn } from '../../lib/cn';
import { ArrowRightIcon } from './icons';

const cardBase = 'rounded-card border border-line bg-surface-raised text-fg shadow-card';

/**
 * A white working surface ("sheet") for setup forms and focused tasks. Pair it
 * with `divide-y divide-line` and sections using `sheetSectionClass`.
 */
export const sheetClass = 'rounded-panel border border-line bg-surface-raised text-fg shadow-card';
export const sheetSectionClass = 'grid gap-4 p-5 sm:p-6';

const interactiveCard =
  'group block no-underline transition-[translate,box-shadow,border-color] duration-(--duration-base) ease-standard ' +
  'hover:-translate-y-1 hover:border-accent hover:shadow-raised ' +
  'active:translate-y-0 motion-reduce:hover:translate-y-0';

export interface CardProps extends HTMLAttributes<HTMLElement> {
  as?: 'div' | 'article' | 'section' | 'li';
  padded?: boolean;
}

/** Static content container. */
export function Card({ as: Tag = 'div', padded = true, className, ...props }: CardProps) {
  return <Tag className={cn(cardBase, padded && 'p-5 sm:p-6', className)} {...props} />;
}

interface LinkCardBaseProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
  title: string;
  description?: ReactNode;
  icon?: ReactNode;
}

/**
 * `to`: in-app route, rendered as a React Router link (basename-aware, no reload).
 * `href`: native anchor, for in-page fragments ("#bolum") and external URLs.
 */
export type LinkCardProps = LinkCardBaseProps &
  ({ to: string; href?: never } | { href: string; to?: never });

/**
 * Whole-card link with hover lift. The title is the accessible name; the arrow
 * slides on hover as an additional, non-color cue.
 */
export function LinkCard({
  title,
  description,
  icon,
  className,
  to,
  href,
  ...props
}: LinkCardProps) {
  const classes = cn(cardBase, interactiveCard, 'p-5 sm:p-6', className);
  const content = (
    <span className="flex items-start gap-4">
      {icon ? (
        <span className="grid size-11 shrink-0 place-items-center rounded-control bg-accent-soft text-[1.35rem] text-on-accent-soft">
          {icon}
        </span>
      ) : null}
      <span className="min-w-0 flex-1">
        <span className="block text-h4 text-fg">{title}</span>
        {description ? (
          <span className="mt-1 block text-small text-fg-muted">{description}</span>
        ) : null}
      </span>
      <ArrowRightIcon
        aria-hidden="true"
        className="mt-1 shrink-0 text-[1.25rem] text-accent transition-transform duration-(--duration-base) ease-standard group-hover:translate-x-1 motion-reduce:group-hover:translate-x-0"
      />
    </span>
  );

  return to !== undefined ? (
    <Link to={to} className={classes} {...props}>
      {content}
    </Link>
  ) : (
    <a href={href} className={classes} {...props}>
      {content}
    </a>
  );
}
