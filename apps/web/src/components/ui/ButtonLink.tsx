import type { ReactNode } from 'react';
import { Link } from 'react-router';
import type { LinkProps } from 'react-router';
import { cn } from '../../lib/cn';
import { sheen } from './Button';
import type { Mode } from './modeIcons';

export type ButtonLinkVariant = 'primary' | 'secondary' | 'ghost' | 'mode' | 'mode-soft';
export type ButtonLinkSize = 'sm' | 'md' | 'lg';

// Mirrors the Button look for navigation. Links have no :enabled/:disabled
// states, so the variants are written without those modifiers.
const base =
  'inline-flex min-w-0 max-w-full select-none items-center justify-center gap-2 rounded-control text-center font-semibold tracking-[-0.005em] no-underline ' +
  'transition-[background-color,border-color,color,box-shadow,translate,scale] duration-(--duration-base) ease-standard ' +
  'active:scale-[0.97] active:translate-y-0 motion-reduce:hover:translate-y-0';

const variants: Record<ButtonLinkVariant, string> = {
  primary:
    sheen +
    'bg-action text-on-action shadow-(--shadow-action) ' +
    'hover:-translate-y-px hover:bg-action-hover hover:text-on-action hover:shadow-(--shadow-action-hover)',
  secondary:
    'border border-line-strong/70 bg-surface-raised text-fg shadow-card ' +
    'hover:border-accent hover:bg-accent-soft hover:text-on-accent-soft',
  ghost: 'text-accent hover:bg-accent-soft hover:text-on-accent-soft',
  // The Button mode variants without the `enabled:` guard (written out in full so
  // Tailwind generates every class).
  mode:
    sheen +
    'bg-(--mode-deep) text-white shadow-[0_10px_22px_-12px_var(--mode-glow),0_2px_4px_-2px_rgb(13_19_33/0.28)] ' +
    'hover:-translate-y-px hover:bg-(--mode-ink) hover:text-white ' +
    'hover:shadow-[0_16px_28px_-12px_var(--mode-glow),0_2px_4px_-2px_rgb(13_19_33/0.28)]',
  'mode-soft':
    'border border-(--mode-soft) bg-(--mode-tint) text-(--mode-ink) ' +
    'hover:border-(--mode-line) hover:bg-(--mode-soft) hover:text-(--mode-ink)',
};

const sizes: Record<ButtonLinkSize, string> = {
  sm: 'min-h-9 px-3.5 py-1.5 text-small',
  md: 'min-h-11 px-5 py-2 text-body',
  lg: 'min-h-13 px-7 py-2.5 text-body-lg',
};

export interface ButtonLinkProps extends Omit<LinkProps, 'className'> {
  variant?: ButtonLinkVariant | undefined;
  size?: ButtonLinkSize | undefined;
  /** Optional leading icon (decorative). */
  icon?: ReactNode;
  /** Palette for the `mode` and `mode-soft` variants; see Button. */
  mode?: Mode | undefined;
  className?: string | undefined;
}

/** A router link that looks like a Button. Use it for navigation, never for actions. */
export function ButtonLink({
  variant = 'primary',
  size = 'md',
  icon,
  mode,
  className,
  children,
  ...props
}: ButtonLinkProps) {
  return (
    <Link
      data-mode={mode}
      className={cn(base, variants[variant], sizes[size], className)}
      {...props}
    >
      {icon ? (
        <span aria-hidden="true" className="shrink-0 text-[1.15em]">
          {icon}
        </span>
      ) : null}
      <span className="min-w-0 wrap-anywhere">{children}</span>
    </Link>
  );
}
