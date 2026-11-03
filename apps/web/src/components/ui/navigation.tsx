import { motion } from 'motion/react';
import { useId, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { Link, NavLink } from 'react-router';
import { cn } from '../../lib/cn';
import { ChevronRightIcon } from './icons';

/* ---- Top navigation -------------------------------------------------------- */

export interface TopNavItem {
  /** Router path, resolved against the app basename (e.g. "/listeler"). */
  to: string;
  label: string;
  icon?: ReactNode;
  /** Only match the exact path (use for index-like routes). */
  end?: boolean;
}

export interface TopNavProps {
  label: string;
  items: TopNavItem[];
  className?: string;
}

/**
 * Horizontal navigation driven by the router: NavLink marks the current route
 * with aria-current="page". The active item gets a filled pill plus an
 * indicator bar drawn on the surface itself, so the state stays visible (≥3:1)
 * even where the fill has low contrast against the surface.
 */
export function TopNav({ label, items, className }: TopNavProps) {
  const indicatorId = useId();
  return (
    <nav aria-label={label} className={cn('py-1', className)}>
      <ul className="flex flex-wrap items-center gap-x-1 gap-y-2">
        {items.map((item) => (
          <li key={item.to} className="pb-2">
            <NavLink
              to={item.to}
              end={item.end ?? false}
              className={({ isActive }) =>
                cn(
                  'relative isolate flex items-center gap-2 rounded-control px-3.5 py-2 text-small font-semibold no-underline',
                  'transition-colors duration-(--duration-fast) ease-standard',
                  isActive
                    ? 'text-on-selected hover:text-on-selected'
                    : 'text-fg-muted hover:bg-surface-raised hover:text-fg',
                )
              }
            >
              {({ isActive }) => (
                <>
                  {isActive ? (
                    <motion.span
                      layoutId={indicatorId}
                      aria-hidden="true"
                      className="absolute inset-0 -z-10 rounded-control bg-selected"
                      transition={{ type: 'spring', stiffness: 520, damping: 40 }}
                    >
                      {/* Sits below the pill, on the surface, separated by a 3px gap. */}
                      <span className="absolute inset-x-2 -bottom-1.5 h-[3px] rounded-full bg-selected-indicator" />
                    </motion.span>
                  ) : null}
                  {item.icon ? <span className="text-[1.1em]">{item.icon}</span> : null}
                  {item.label}
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/* ---- Tabs (WAI-ARIA tabs pattern, automatic activation) -------------------- */

export interface TabItem {
  id: string;
  label: string;
  panel: ReactNode;
}

export interface TabsProps {
  label: string;
  items: TabItem[];
  defaultId?: string;
}

export function Tabs({ label, items, defaultId }: TabsProps) {
  const baseId = useId();
  const [selectedId, setSelectedId] = useState(defaultId ?? items[0]?.id);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const select = (index: number) => {
    const count = items.length;
    const next = items[(index + count) % count];
    if (!next) return;
    setSelectedId(next.id);
    tabRefs.current[(index + count) % count]?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const keyMap: Record<string, number> = {
      ArrowRight: index + 1,
      ArrowLeft: index - 1,
      Home: 0,
      End: items.length - 1,
    };
    const target = keyMap[event.key];
    if (target === undefined) return;
    event.preventDefault();
    select(target);
  };

  return (
    <div>
      <div
        role="tablist"
        aria-label={label}
        className="flex gap-1 overflow-x-auto overflow-y-hidden border-b border-line"
      >
        {items.map((item, index) => {
          const selected = item.id === selectedId;
          return (
            <button
              key={item.id}
              ref={(node) => {
                tabRefs.current[index] = node;
              }}
              type="button"
              role="tab"
              id={`${baseId}-tab-${item.id}`}
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${item.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setSelectedId(item.id)}
              onKeyDown={(event) => onKeyDown(event, index)}
              className={cn(
                'relative shrink-0 rounded-t-control px-4 pt-2.5 pb-3 text-small font-semibold',
                'transition-colors duration-(--duration-fast) ease-standard',
                selected ? 'text-accent' : 'text-fg-muted hover:bg-surface-sunken hover:text-fg',
              )}
            >
              {item.label}
              {selected ? (
                <motion.span
                  layoutId={`${baseId}-indicator`}
                  className="absolute inset-x-2 bottom-0 h-[3px] rounded-full bg-accent"
                  transition={{ type: 'spring', stiffness: 520, damping: 42 }}
                  aria-hidden="true"
                />
              ) : null}
            </button>
          );
        })}
      </div>
      {items.map((item) => (
        <div
          key={item.id}
          role="tabpanel"
          id={`${baseId}-panel-${item.id}`}
          aria-labelledby={`${baseId}-tab-${item.id}`}
          hidden={item.id !== selectedId}
          tabIndex={0}
          className="pt-4"
        >
          {item.panel}
        </div>
      ))}
    </div>
  );
}

/* ---- Breadcrumbs ----------------------------------------------------------- */

export interface Crumb {
  label: string;
  /** Router path (basename-aware). Omit for the current page or a non-link level. */
  to?: string;
}

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Sayfa konumu">
      <ol className="flex flex-wrap items-center gap-1.5 text-small">
        {items.map((item, index) => {
          const last = index === items.length - 1;
          return (
            <li key={`${item.label}-${index}`} className="flex items-center gap-1.5">
              {last || !item.to ? (
                <span aria-current={last ? 'page' : undefined} className="font-semibold text-fg">
                  {item.label}
                </span>
              ) : (
                <Link to={item.to} className="font-medium underline-offset-4 hover:underline">
                  {item.label}
                </Link>
              )}
              {last ? null : <ChevronRightIcon aria-hidden="true" className="text-fg-muted" />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
