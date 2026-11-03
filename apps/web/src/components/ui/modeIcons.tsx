import type { LucideIcon, LucideProps } from 'lucide-react';
import {
  ArrowLeftRight,
  Blocks,
  Grid2x2,
  Grid3x3,
  Headphones,
  Highlighter,
  Layers,
  ListChecks,
  PenLine,
  Shuffle,
  TextSearch,
} from 'lucide-react';
import { cn } from '../../lib/cn';

// Kept apart from icons.tsx (which the app shell loads), so these glyphs are only
// downloaded with the pages that show study modes.

export type Mode =
  | 'flashcards'
  | 'written'
  | 'listening'
  | 'review'
  | 'mixed'
  | 'quiz'
  | 'matching'
  | 'assembly'
  | 'memory'
  | 'word-search'
  | 'crossword';

const glyphs: Record<Mode, LucideIcon> = {
  flashcards: Layers,
  written: PenLine,
  listening: Headphones,
  review: Highlighter,
  mixed: Shuffle,
  quiz: ListChecks,
  matching: ArrowLeftRight,
  assembly: Blocks,
  memory: Grid2x2,
  'word-search': TextSearch,
  crossword: Grid3x3,
};

/**
 * Study modes (cool hues, review in the amber highlighter) and practice games
 * (warmer hues). Each mode's own colors are defined in styles/modes.css.
 */
export type ModeFamily = 'study' | 'review' | 'game';

export function ModeIcon({ mode, ...props }: { mode: Mode } & LucideProps) {
  const Glyph = glyphs[mode];
  return <Glyph size="1em" aria-hidden="true" focusable="false" {...props} />;
}

/**
 * Decorative square that carries a mode's glyph in the mode's colors; the visible
 * title names the mode. `soft`: tinted tile with a dark glyph (default). `solid`:
 * the mode's gradient with a white glyph, for headers and featured places.
 */
export function ModeTile({
  mode,
  size = 'md',
  tone = 'soft',
  className,
}: {
  mode: Mode;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | undefined;
  tone?: 'soft' | 'solid' | undefined;
  className?: string | undefined;
}) {
  return (
    <span
      aria-hidden="true"
      data-mode={mode}
      className={cn(
        'grid shrink-0 place-items-center',
        size === 'xs' && 'size-7 rounded-[0.5rem] text-[0.95rem]',
        size === 'sm' && 'size-9 rounded-[0.6rem] text-[1.1rem]',
        size === 'md' && 'size-11 rounded-control text-[1.35rem]',
        size === 'lg' && 'size-13 rounded-[0.95rem] text-[1.6rem]',
        size === 'xl' && 'size-16 rounded-card text-[1.95rem]',
        tone === 'soft'
          ? 'bg-(--mode-tint) text-(--mode-ink) shadow-[inset_0_0_0_1px_var(--mode-soft)]'
          : 'bg-(image:--mode-gradient) text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.25),0_8px_18px_-8px_var(--mode-glow)]',
        className,
      )}
    >
      <ModeIcon mode={mode} />
    </span>
  );
}
