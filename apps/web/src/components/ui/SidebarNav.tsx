import type { ReactNode } from 'react';
import { NavLink } from 'react-router';
import { cn } from '../../lib/cn';

export interface SidebarNavProps {
  /** Accessible name of the navigation landmark, e.g. "Ana gezinme". */
  label: string;
  children: ReactNode;
  className?: string;
}

/**
 * Vertical primary navigation for the dashboard's charcoal sidebar. Place it
 * inside a `data-surface="dark"` container; all colors come from semantic
 * tokens, so it also renders correctly on light and navy surfaces.
 */
export function SidebarNav({ label, children, className }: SidebarNavProps) {
  return (
    <nav aria-label={label} className={className}>
      <ul className="grid gap-1">{children}</ul>
    </nav>
  );
}

export interface SidebarNavItemProps {
  /** Router path, resolved against the app basename (e.g. "/listeler"). */
  to: string;
  /** Decorative icon; the visible label provides the accessible name. */
  icon?: ReactNode;
  children: ReactNode;
  /** Only match the exact path (use for the dashboard index route). */
  end?: boolean;
}

// Fill, text and indicator change together, with one duration and easing, so the
// label and its background are always at the same point of the transition and the
// text stays readable at every step (asserted in tokens.contrast.test.ts).
const colorTransition =
  'transition-[color,background-color] duration-(--duration-fast) ease-standard';

/**
 * Router-aware sidebar link. NavLink sets aria-current="page" on the current
 * route. The active state uses three cues: blue fill (#1262b0) with white text
 * (6.18:1), a left indicator bar on the surface (#7cbbff, 8.56:1 on charcoal,
 * which satisfies the 3:1 state requirement even though the fill alone is
 * 2.80:1 there), and bold text.
 *
 * The selection changes in place: the new item's fill and indicator fade in while
 * the previous item's fade out. Nothing moves between items.
 */
export function SidebarNavItem({ to, icon, children, end = false }: SidebarNavItemProps) {
  return (
    <li>
      <NavLink
        to={to}
        end={end}
        className={({ isActive }) =>
          cn(
            'relative ml-3 flex min-h-11 items-center gap-3 rounded-control px-3 py-2.5 text-body no-underline',
            colorTransition,
            // Stronger than the global 2px ring: keyboard focus must be obvious in a dense list.
            'focus-visible:outline-[3px] focus-visible:outline-offset-2',
            isActive
              ? 'bg-selected font-semibold text-on-selected hover:text-on-selected'
              : 'font-medium text-fg-muted hover:bg-surface-raised hover:text-fg',
          )
        }
      >
        {({ isActive }) => (
          <>
            {/* Sits in the 0.75rem gutter left of the link, on the sidebar surface. */}
            <span
              aria-hidden="true"
              className={cn(
                'pointer-events-none absolute top-1.5 bottom-1.5 -left-3 w-1 rounded-r-full',
                colorTransition,
                isActive ? 'bg-selected-indicator' : 'bg-transparent',
              )}
            />
            {icon ? (
              <span aria-hidden="true" className="shrink-0 text-[1.25rem]">
                {icon}
              </span>
            ) : null}
            <span className="min-w-0 truncate">{children}</span>
          </>
        )}
      </NavLink>
    </li>
  );
}
