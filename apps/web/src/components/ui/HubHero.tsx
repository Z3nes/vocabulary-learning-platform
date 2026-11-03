import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { ModeArt } from './ModeArt';
import type { Mode } from './modeIcons';
import { Eyebrow } from './PageHeader';

export interface HubHeroProps {
  eyebrow: string;
  title: string;
  description: string;
  /** `study`: the cool blue glow; `practice`: a warmer magenta glow. Both on navy. */
  tone: 'study' | 'practice';
  /** Three modes drawn as a fanned stack of illustrated cards (decorative). */
  modes: readonly [Mode, Mode, Mode];
  /** Extra content under the description, e.g. a short fact row. */
  children?: ReactNode;
}

// Back-left, back-right and front card of the fan.
const slots = [
  'top-[4%] left-0 -rotate-[8deg]',
  'top-0 right-0 rotate-[6deg]',
  'bottom-0 left-[20%] z-10 -rotate-1',
];

/**
 * The header of a hub page ("Kelime Çalış", "Alıştırmalar"): the page's only <h1>
 * (focusable, like PageHeader's, because the app shell moves focus to it) on the
 * institutional navy, with miniatures of the hub's modes beside it.
 */
export function HubHero({ eyebrow, title, description, tone, modes, children }: HubHeroProps) {
  return (
    <header
      data-surface="navy"
      className={cn(
        'hero-surface @container/hub relative isolate overflow-hidden rounded-panel px-6 py-9 shadow-(--shadow-float) sm:px-10 sm:py-11',
        tone === 'practice' && 'hero-surface-warm',
      )}
    >
      {/* The sidebar reduces usable width even on desktop; art yields to the text. */}
      <div className="grid items-center gap-8 @2xl/hub:grid-cols-[minmax(0,1fr)_minmax(15rem,20rem)] @4xl/hub:grid-cols-[minmax(0,1fr)_minmax(18rem,23rem)]">
        <div className="grid min-w-0 max-w-2xl gap-4">
          <Eyebrow>{eyebrow}</Eyebrow>
          <h1 tabIndex={-1} className="wrap-anywhere text-display text-fg">
            {title}
          </h1>
          <p className="text-body-lg text-fg-muted">{description}</p>
          {children}
        </div>
        <div
          aria-hidden="true"
          className="hub-collage relative hidden h-48 @2xl/hub:block @4xl/hub:h-56"
        >
          {modes.map((mode, index) => (
            <div
              key={mode}
              data-mode={mode}
              className={cn(
                'hub-collage-card mode-art-stage absolute aspect-[5/3] w-[64%] rounded-card border border-white/80 p-2',
                'shadow-[0_26px_44px_-20px_rgb(0_0_0/0.65),0_0_0_1px_rgb(255_255_255/0.08)]',
                slots[index],
              )}
            >
              <ModeArt mode={mode} />
            </div>
          ))}
        </div>
      </div>
    </header>
  );
}
