import { sheetClass } from '../../components/ui/Card';
import { cn } from '../../lib/cn';

// Shared look of the practice game boards (kept apart from GameFrame.tsx, which
// exports components only). Colors marked `--mode-*` follow the game's palette
// (modes.css): every game sets `data-mode` on its root.

/** The white playing surface of a round, with its prompt, board and turn footer. */
export const boardClass = cn(sheetClass, 'grid overflow-hidden shadow-raised');
/** The prompt band: a wash of the game's tint above the board. */
export const boardPromptClass =
  'grid gap-2 border-b border-(--mode-soft) bg-[linear-gradient(180deg,var(--mode-tint),color-mix(in_srgb,var(--mode-tint)_25%,var(--sem-surface-raised)))] px-5 py-6 sm:px-8 sm:py-7';
export const boardBodyClass = 'grid gap-5 p-5 sm:p-8';
export const boardFooterClass =
  'grid gap-4 border-t border-line bg-surface/70 px-5 py-4 sm:flex sm:min-h-20 sm:items-center sm:justify-between sm:px-8';

/** The small label above a prompt ("İngilizce kelime"), in the game's ink. */
export const promptLabelClass =
  'inline-flex w-fit items-center gap-1.5 rounded-full bg-surface-raised px-3 py-1 text-caption font-bold tracking-[0.08em] text-(--mode-ink) uppercase shadow-[inset_0_0_0_1px_var(--mode-soft)]';

/** A large answer button; games add a state tone (see `choiceTones`). */
export const choiceClass =
  'flex min-h-14 w-full items-center gap-3 rounded-card border-2 px-4 py-3 text-left text-body text-fg wrap-anywhere ' +
  'transition-[border-color,background-color,color,box-shadow] duration-(--duration-fast) ease-standard ' +
  'aria-disabled:cursor-default disabled:cursor-default';

export const choiceTones = {
  idle:
    'border-line bg-surface-raised shadow-card ' +
    'not-aria-disabled:not-disabled:hover:border-(--mode-line) not-aria-disabled:not-disabled:hover:bg-(--mode-tint) ' +
    'not-aria-disabled:not-disabled:hover:shadow-raised',
  // The halo repeats the selection without relying on the border color alone.
  selected: 'border-(--mode-deep) bg-(--mode-tint) shadow-[0_0_0_4px_var(--mode-soft)]',
  correct: 'border-success bg-success-soft',
  missed: 'border-on-highlight/50 bg-highlight text-on-highlight',
  muted: 'border-line bg-surface text-fg-muted',
} as const;
