import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react';
import { cn } from '../../lib/cn';
import type { Mode } from './modeIcons';

export type ButtonVariant =
  'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-ghost' | 'mode' | 'mode-soft';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner, announces "busy" and blocks repeated activation. */
  loading?: boolean;
  /** Optional leading icon (decorative). */
  icon?: ReactNode;
  /**
   * Palette for the `mode` and `mode-soft` variants (modes.css). Without it they
   * use the nearest ancestor's `data-mode`, e.g. the game or study screen.
   */
  mode?: Mode | undefined;
  ref?: Ref<HTMLButtonElement>;
}

const base =
  'relative inline-flex min-w-0 max-w-full select-none items-center justify-center gap-2 rounded-control font-semibold tracking-[-0.005em] ' +
  'transition-[background-color,border-color,color,box-shadow,translate,scale] duration-(--duration-base) ease-standard ' +
  'enabled:active:scale-[0.97] enabled:active:translate-y-0 ' +
  // Same specificity as the variants' enabled:hover lift, so reduced motion cancels it.
  'motion-reduce:enabled:hover:translate-y-0 ' +
  'disabled:cursor-not-allowed disabled:shadow-none';

/**
 * Filled buttons carry a light sheen at the top (a white overlay gradient on the
 * action color), so they read as pressable on every surface; the label always
 * sits on the plain action color in the middle (≥ 4.5:1).
 */
export const sheen = 'bg-[linear-gradient(180deg,rgb(255_255_255/0.12),rgb(255_255_255/0)_60%)] ';

/**
 * Mode-colored buttons: white text on the mode's deep color, or the mode's ink on
 * its tint (both ≥ 4.5:1, asserted by modes.contrast.test.ts). Shared with ButtonLink.
 */
export const modeFilled =
  'bg-(--mode-deep) text-white shadow-[0_10px_22px_-12px_var(--mode-glow),0_2px_4px_-2px_rgb(13_19_33/0.28)] ' +
  'enabled:hover:-translate-y-px enabled:hover:bg-(--mode-ink) ' +
  'enabled:hover:shadow-[0_16px_28px_-12px_var(--mode-glow),0_2px_4px_-2px_rgb(13_19_33/0.28)] ';
export const modeSoft =
  'border border-(--mode-soft) bg-(--mode-tint) text-(--mode-ink) ' +
  'enabled:hover:border-(--mode-line) enabled:hover:bg-(--mode-soft) ';

const variants: Record<ButtonVariant, string> = {
  primary:
    sheen +
    'bg-action text-on-action shadow-(--shadow-action) ' +
    'enabled:hover:bg-action-hover enabled:hover:-translate-y-px enabled:hover:shadow-(--shadow-action-hover) ' +
    'disabled:bg-none disabled:bg-disabled disabled:text-on-disabled',
  secondary:
    'border border-line-strong/70 bg-surface-raised text-fg shadow-card ' +
    'enabled:hover:border-accent enabled:hover:bg-accent-soft enabled:hover:text-on-accent-soft ' +
    'disabled:border-transparent disabled:bg-disabled disabled:text-on-disabled',
  ghost:
    'text-accent enabled:hover:bg-accent-soft enabled:hover:text-on-accent-soft ' +
    'disabled:text-on-disabled',
  danger:
    sheen +
    'bg-danger-action text-on-danger-action shadow-card ' +
    'enabled:hover:bg-danger-action-hover enabled:hover:-translate-y-px enabled:hover:shadow-raised ' +
    'disabled:bg-none disabled:bg-disabled disabled:text-on-disabled',
  // Quiet entry point to a destructive flow (the confirmation uses `danger`).
  'danger-ghost': 'text-danger enabled:hover:bg-danger-soft disabled:text-on-disabled',
  mode: sheen + modeFilled + 'disabled:bg-none disabled:bg-disabled disabled:text-on-disabled',
  'mode-soft':
    modeSoft + 'disabled:border-transparent disabled:bg-disabled disabled:text-on-disabled',
};

const sizes: Record<ButtonSize, string> = {
  sm: 'min-h-9 px-3.5 py-1.5 text-small',
  md: 'min-h-11 px-5 py-2 text-body',
  lg: 'min-h-13 px-7 py-2.5 text-body-lg',
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  mode,
  disabled,
  className,
  children,
  type = 'button',
  onClick,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled}
      data-mode={mode}
      // While loading the button stays focusable and keeps its color, but ignores activation.
      aria-disabled={loading || undefined}
      aria-busy={loading || undefined}
      onClick={loading ? (event) => event.preventDefault() : onClick}
      className={cn(base, variants[variant], sizes[size], loading && 'cursor-progress', className)}
      {...props}
    >
      {loading ? (
        <Spinner />
      ) : icon ? (
        <span aria-hidden="true" className="shrink-0 text-[1.15em]">
          {icon}
        </span>
      ) : null}
      <span className="min-w-0 wrap-anywhere">{children}</span>
      {loading ? <span className="sr-only">(yükleniyor)</span> : null}
    </button>
  );
}

/** Decorative busy indicator; pair it with text for assistive technology. */
export function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="size-[1.1em] shrink-0 animate-spin rounded-full border-2 border-current border-r-transparent"
    />
  );
}
