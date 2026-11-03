import { useId } from 'react';
import type { InputHTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/cn';

export interface ChoiceTileProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type' | 'children' | 'className'
> {
  /** Primary text, e.g. "%25". */
  label: ReactNode;
  /** Secondary line, e.g. "12 kart". */
  detail?: ReactNode;
  /**
   * One-string accessible name. Use it when `label` and `detail` must be read as
   * a single phrase ("%25 · 12 soru"); the visual parts are then hidden from
   * assistive technology, so the name is never announced twice.
   */
  accessibleLabel?: string | undefined;
  /**
   * Announce `detail` as the radio's description instead of part of its name,
   * for longer explanations (the name stays short, e.g. "İngilizce → Türkçe").
   */
  describeDetail?: boolean | undefined;
  className?: string | undefined;
}

const tile =
  'group relative flex min-h-11 cursor-pointer items-start gap-3 rounded-card border border-line-strong/60 bg-surface-raised px-4 py-3.5 text-fg shadow-card ' +
  'transition-[border-color,background-color,box-shadow] duration-(--duration-fast) ease-standard ' +
  'hover:border-accent hover:bg-surface ' +
  // Selected: tinted fill, accent border doubled by an inset ring, a soft glow, and the filled dot.
  'has-[:checked]:border-accent has-[:checked]:bg-accent-soft has-[:checked]:shadow-[inset_0_0_0_1px_var(--sem-accent),0_10px_22px_-14px_rgb(18_98_176/0.7)] ' +
  // The native radio is visually hidden, so the tile shows its keyboard focus.
  'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus ' +
  'has-[:disabled]:cursor-not-allowed has-[:disabled]:border-line has-[:disabled]:bg-disabled has-[:disabled]:text-on-disabled';

/**
 * A radio button presented as a selectable tile. The native input keeps keyboard
 * behavior (arrow keys within the group, Space to select) and form semantics;
 * the selected state is shown by the dot, the border and the fill together.
 */
export function ChoiceTile({
  label,
  detail,
  accessibleLabel,
  describeDetail,
  className,
  ...input
}: ChoiceTileProps) {
  const detailId = useId();
  const described = Boolean(describeDetail && detail);
  return (
    <label className={cn(tile, className)}>
      <input
        type="radio"
        className="sr-only"
        aria-describedby={described ? detailId : undefined}
        {...input}
      />
      {accessibleLabel ? <span className="sr-only">{accessibleLabel}</span> : null}
      <span
        aria-hidden="true"
        className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border-2 border-line-strong bg-surface-raised transition-colors duration-(--duration-fast) ease-standard group-has-[:checked]:border-action"
      >
        <span className="size-2.5 scale-0 rounded-full bg-action transition-[scale] duration-(--duration-fast) ease-emphasized group-has-[:checked]:scale-100" />
      </span>
      <span className="grid min-w-0 gap-0.5">
        <span aria-hidden={accessibleLabel ? true : undefined} className="text-body font-semibold">
          {label}
        </span>
        {detail ? (
          <span
            id={described ? detailId : undefined}
            aria-hidden={accessibleLabel || described ? true : undefined}
            className="text-small text-fg-muted"
          >
            {detail}
          </span>
        ) : null}
      </span>
    </label>
  );
}

export interface ChoiceGroupProps {
  legend: string;
  /** Optional explanation under the legend. */
  hint?: ReactNode;
  children: ReactNode;
  /** Grid columns for the tiles, e.g. "grid-cols-2 sm:grid-cols-4". */
  columns?: string | undefined;
  className?: string | undefined;
}

/** A fieldset of ChoiceTiles with a visible legend. */
export function ChoiceGroup({ legend, hint, children, columns, className }: ChoiceGroupProps) {
  return (
    <fieldset className={cn('grid min-w-0 gap-3', className)}>
      <legend className="mb-3 text-h4 text-fg">{legend}</legend>
      {hint ? <div className="-mt-1 text-small text-fg-muted">{hint}</div> : null}
      <div className={cn('grid gap-2.5', columns)}>{children}</div>
    </fieldset>
  );
}
