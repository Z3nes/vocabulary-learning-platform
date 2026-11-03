import { cn } from '../../lib/cn';
import { CardsIcon, GamesIcon } from './icons';

/**
 * The emblem of a mode family: study modes (cards icon on a cool gradient) or
 * practice games and puzzles (game icon on a warm gradient). Decorative; the
 * family is always named in nearby text.
 */
export function FamilyBadge({
  family,
  size = 'md',
  className,
}: {
  family: 'study' | 'practice';
  size?: 'sm' | 'md' | undefined;
  className?: string | undefined;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'grid shrink-0 place-items-center text-white',
        'shadow-[inset_0_1px_0_rgb(255_255_255/0.25),0_10px_20px_-10px_rgb(13_19_33/0.5)]',
        size === 'sm'
          ? 'size-10 rounded-control text-[1.2rem]'
          : 'size-12 rounded-[0.95rem] text-[1.45rem]',
        family === 'study'
          ? 'bg-[linear-gradient(140deg,#3b82f6,#1262b0_55%,#4338ca)]'
          : 'bg-[linear-gradient(140deg,#fb923c,#e11d48_60%,#c026d3)]',
        className,
      )}
    >
      {family === 'study' ? <CardsIcon /> : <GamesIcon />}
    </span>
  );
}
