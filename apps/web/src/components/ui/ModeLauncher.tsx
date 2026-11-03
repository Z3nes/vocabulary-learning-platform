import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { cn } from '../../lib/cn';
import { ArrowRightIcon } from './icons';
import { ModeArt } from './ModeArt';
import { ModeTile, type Mode } from './modeIcons';

export interface ModeLauncherProps {
  mode: Mode;
  /** The link text and accessible name, e.g. "Klasik test". */
  title: string;
  description: ReactNode;
  to: string;
  headingLevel?: 'h2' | 'h3' | 'h4' | undefined;
  /**
   * `feature`: an illustrated card (the mode's miniature above its text).
   * `row`: a compact horizontal entry with the mode tile.
   */
  variant?: 'feature' | 'row' | undefined;
  /** Extra line under the description (requirements, notes). */
  meta?: ReactNode;
  /** Short decorative call to action shown at the card's foot. */
  cta?: string | undefined;
  /**
   * Featured card: once its container is wide (@2xl), the illustration and the
   * text sit side by side. Use with a two-column span.
   */
  wide?: boolean | undefined;
  className?: string | undefined;
}

/**
 * A study mode entry in the mode's own colors. The title link's ::after covers
 * the card, so the whole surface is clickable while the link's name stays just
 * the title; the illustration and the "Başla" cue are decorative. Hover and
 * focus styles live in global.css (.mode-card).
 */
export function ModeLauncher({
  mode,
  title,
  description,
  to,
  headingLevel: Heading = 'h3',
  variant = 'feature',
  meta,
  cta = 'Başla',
  wide = false,
  className,
}: ModeLauncherProps) {
  const link = (
    <Link
      to={to}
      className="launcher-link text-fg no-underline outline-none after:absolute after:inset-0 after:z-10 after:rounded-card"
    >
      {title}
    </Link>
  );

  if (variant === 'row')
    return (
      <li
        data-mode={mode}
        className={cn(
          'mode-card relative flex items-center gap-4 rounded-card border border-line bg-surface-raised p-4 shadow-card',
          className,
        )}
      >
        <ModeTile mode={mode} />
        <div className="grid min-w-0 flex-1 gap-0.5">
          <Heading className="text-h4 text-fg">{link}</Heading>
          <p className="text-small text-fg-muted">{description}</p>
          {meta}
        </div>
        <span
          aria-hidden="true"
          className="mode-card-go grid size-9 shrink-0 place-items-center rounded-full bg-(--mode-tint) text-(--mode-ink)"
        >
          <ArrowRightIcon className="text-[1.1rem]" />
        </span>
      </li>
    );

  return (
    <li
      data-mode={mode}
      className={cn(
        'mode-card relative flex flex-col overflow-hidden rounded-card border border-line bg-surface-raised shadow-card',
        wide && '@2xl:flex-row',
        className,
      )}
    >
      <div
        className={cn(
          'mode-card-art mode-art-stage h-32 border-b border-(--mode-soft) px-6 py-3 sm:h-36',
          wide && '@2xl:h-auto @2xl:min-h-52 @2xl:w-[54%] @2xl:border-r @2xl:border-b-0 @2xl:p-6',
        )}
      >
        {/* The wrapper takes the hover zoom (global.css), so the wide card's larger scale stays. */}
        <div className="size-full">
          <ModeArt mode={mode} className={wide ? '@2xl:scale-125' : undefined} />
        </div>
      </div>
      <div className={cn('flex flex-1 flex-col gap-3 p-5', wide && '@2xl:justify-center @2xl:p-7')}>
        <div className="flex items-center gap-3">
          <ModeTile mode={mode} size={wide ? 'md' : 'sm'} tone="solid" />
          <Heading className={cn('min-w-0 text-fg', wide ? 'text-h3' : 'text-h4')}>{link}</Heading>
        </div>
        <p className="text-small text-fg-muted">{description}</p>
        {meta}
        <span
          aria-hidden="true"
          className={cn(
            'mode-card-go mt-auto inline-flex h-9 items-center gap-1.5 self-start rounded-full bg-(--mode-tint) pr-3 pl-3.5 text-small font-semibold text-(--mode-ink)',
            wide && '@2xl:mt-2',
          )}
        >
          {cta}
          <ArrowRightIcon />
        </span>
      </div>
    </li>
  );
}
