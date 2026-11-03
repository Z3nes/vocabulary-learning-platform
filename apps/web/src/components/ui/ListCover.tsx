import { cn } from '../../lib/cn';
import type { Mode } from './modeIcons';

// Lists borrow a mode palette for their cover, chosen from the list id, so a list
// keeps the same color everywhere (and across renames).
const palettes: Mode[] = [
  'flashcards',
  'written',
  'listening',
  'mixed',
  'quiz',
  'assembly',
  'word-search',
  'matching',
];

function paletteFor(id: string): Mode {
  let hash = 0;
  for (const character of id) hash = (hash * 31 + character.codePointAt(0)!) >>> 0;
  return palettes[hash % palettes.length]!;
}

/** Up to two characters: the first letters of the first two words, else the first two letters. */
function initials(title: string): string {
  const words = title.split(/\s+/u).filter(Boolean);
  const letters =
    words.length >= 2
      ? [words[0]!, words[1]!].map((word) => [...word.replace(/[^\p{L}\p{N}]/gu, '')][0] ?? '')
      : [...(words[0] ?? '')].filter((character) => /[\p{L}\p{N}]/u.test(character)).slice(0, 2);
  return letters.join('').toLocaleUpperCase('tr-TR') || '·';
}

/**
 * A list's decorative cover: its initials on a colored tile. The list title is
 * always shown as text next to it, so the cover is hidden from assistive technology.
 */
export function ListCover({
  id,
  title,
  size = 'md',
  className,
}: {
  id: string;
  title: string;
  size?: 'sm' | 'md' | 'lg' | undefined;
  className?: string | undefined;
}) {
  return (
    <span
      aria-hidden="true"
      data-mode={paletteFor(id)}
      className={cn(
        'grid shrink-0 place-items-center bg-(image:--mode-gradient) font-bold tracking-[-0.03em] text-white',
        'shadow-[inset_0_1px_0_rgb(255_255_255/0.25),0_8px_16px_-10px_var(--mode-glow)]',
        size === 'sm' && 'size-10 rounded-control text-body',
        size === 'md' && 'size-12 rounded-[0.9rem] text-body-lg',
        size === 'lg' && 'size-14 rounded-card text-h3',
        className,
      )}
    >
      {initials(title)}
    </span>
  );
}
