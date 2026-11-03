import { cn } from '../../lib/cn';

export interface ProgressBarProps {
  value: number;
  max: number;
  /**
   * Accessible name. Without it the bar is decorative (aria-hidden) and the
   * progress must be stated in nearby text, e.g. "Soru 3 / 10".
   */
  label?: string | undefined;
  valueText?: string | undefined;
  /** `mode`: the fill uses the surrounding study mode's gradient (`data-mode`). */
  tone?: 'action' | 'mode' | undefined;
  className?: string | undefined;
}

/** Rounded progress track; the fill eases to its new width (instant with reduced motion). */
export function ProgressBar({
  value,
  max,
  label,
  valueText,
  tone = 'action',
  className,
}: ProgressBarProps) {
  const ratio = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  const semantics = label
    ? {
        role: 'progressbar' as const,
        'aria-label': label,
        'aria-valuemin': 0,
        'aria-valuemax': max,
        'aria-valuenow': value,
        'aria-valuetext': valueText,
      }
    : { 'aria-hidden': true as const };
  return (
    <div
      {...semantics}
      className={cn(
        'h-2.5 w-full overflow-hidden rounded-full bg-surface-sunken shadow-[inset_0_1px_2px_rgb(13_19_33/0.08),inset_0_0_0_1px_var(--sem-line)]',
        className,
      )}
    >
      <div
        className={cn(
          'relative h-full rounded-full transition-[width] duration-(--duration-slow) ease-standard',
          'after:absolute after:inset-x-1 after:top-0.5 after:h-px after:rounded-full after:bg-white/40',
          tone === 'mode'
            ? 'bg-(image:--mode-gradient)'
            : 'bg-action bg-[linear-gradient(90deg,#3b82f6,#1262b0)]',
        )}
        style={{ width: `${ratio * 100}%` }}
      />
    </div>
  );
}
