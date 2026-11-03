import type { ReactNode, Ref } from 'react';
import { cn } from '../../lib/cn';
import { BackLink } from './BackLink';
import { ModeArt } from './ModeArt';
import { ModeTile, type Mode } from './modeIcons';

/** Small uppercase label above a title: the page's place in the product. */
export const eyebrowClass =
  'flex w-fit items-center gap-2 text-caption font-bold tracking-[0.1em] text-accent uppercase ' +
  "before:h-[3px] before:w-4 before:rounded-full before:bg-current before:content-['']";

export function Eyebrow({
  children,
  className,
}: {
  children: ReactNode;
  className?: string | undefined;
}) {
  return <p className={cn(eyebrowClass, className)}>{children}</p>;
}

export interface PageHeaderProps {
  title: ReactNode;
  eyebrow?: ReactNode;
  /** A string becomes a paragraph; other content is placed as given. */
  description?: ReactNode;
  /**
   * Page-level actions. `page`: aligned to the end of the title row on wide
   * screens. `session`: placed in the toolbar row opposite the back link, so a
   * focused screen keeps its title short and its exit always in the same place.
   */
  actions?: ReactNode;
  /** Fixed in-app parent destination, rendered as a BackLink above the title. */
  back?: { to: string; label: string } | undefined;
  /** `session`: a toolbar row and a smaller title for focused study and game screens. */
  variant?: 'page' | 'session' | undefined;
  /**
   * The study mode or game of this screen: its tile stands beside the title and
   * the header carries `data-mode`, so mode-colored content inside follows it.
   */
  mode?: Mode | undefined;
  /** Page variant with a `mode`: shows the mode's miniature at the end of the title row. */
  art?: boolean | undefined;
  titleLang?: string | undefined;
  headingRef?: Ref<HTMLHeadingElement> | undefined;
  className?: string | undefined;
  /** Extra content below the title block (facts, filters, notices). */
  children?: ReactNode;
}

/**
 * Shared page anatomy: back link, eyebrow, the page's only <h1>, description and
 * actions. The h1 is programmatically focusable (tabIndex -1) because the app
 * shell moves focus to it after every route change.
 */
export function PageHeader({
  title,
  eyebrow,
  description,
  actions,
  back,
  variant = 'page',
  mode,
  art = false,
  titleLang,
  headingRef,
  className,
  children,
}: PageHeaderProps) {
  const session = variant === 'session';
  const backLink = back ? <BackLink to={back.to}>{back.label}</BackLink> : null;
  const actionGroup = actions ? (
    <div
      className={cn(
        'flex min-w-0 max-w-full flex-wrap items-center',
        session ? 'ml-auto gap-2' : 'gap-3',
      )}
    >
      {actions}
    </div>
  ) : null;
  const titleBlock = (
    <div className={cn('grid min-w-0 max-w-3xl', session ? 'gap-2' : 'gap-3')}>
      {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
      <h1
        ref={headingRef}
        tabIndex={-1}
        lang={titleLang}
        className={cn('wrap-anywhere text-fg', session ? 'text-h2' : 'text-h1')}
      >
        {title}
      </h1>
      {typeof description === 'string' ? (
        <p
          className={cn(
            'max-w-2xl wrap-anywhere text-fg-muted',
            session ? 'text-body' : 'text-body-lg',
          )}
        >
          {description}
        </p>
      ) : description ? (
        <div
          className={cn(
            'grid min-w-0 max-w-2xl gap-2 wrap-anywhere text-fg-muted',
            session ? 'text-body' : 'text-body-lg',
          )}
        >
          {description}
        </div>
      ) : null}
    </div>
  );

  const identity = mode ? (
    <div className="flex min-w-0 items-start gap-4">
      <ModeTile
        mode={mode}
        size={session ? 'lg' : 'xl'}
        tone="solid"
        className="mt-0.5 hidden sm:grid"
      />
      {titleBlock}
    </div>
  ) : (
    titleBlock
  );

  if (session)
    return (
      <header data-mode={mode} className={cn('grid gap-4', className)}>
        {backLink || actionGroup ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            {backLink}
            {actionGroup}
          </div>
        ) : null}
        {identity}
        {children}
      </header>
    );

  return (
    <header data-mode={mode} className={cn('grid gap-5', className)}>
      {backLink}
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        {/* With the miniature, a flexible basis lets the title wrap so the art fits beside it. */}
        {mode && art ? <div className="min-w-0 flex-[1_1_22rem]">{identity}</div> : identity}
        {actionGroup}
        {mode && art ? (
          <div
            aria-hidden="true"
            className="mode-art-stage hidden h-28 w-48 shrink-0 self-center rounded-card border border-(--mode-soft) p-2 shadow-card xl:block"
          >
            <ModeArt mode={mode} />
          </div>
        ) : null}
      </div>
      {children}
    </header>
  );
}
