import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { AlertIcon, CheckIcon, InfoIcon } from './icons';

export type BadgeTone = 'neutral' | 'info' | 'success' | 'danger' | 'highlight';

const tones: Record<BadgeTone, string> = {
  neutral: 'border-line-strong bg-surface-sunken text-fg',
  info: 'border-transparent bg-accent-soft text-on-accent-soft',
  success: 'border-transparent bg-success-soft text-success',
  danger: 'border-transparent bg-danger-soft text-danger',
  highlight: 'border-transparent bg-highlight text-on-highlight',
};

// Status tones always carry an icon so meaning never depends on color alone.
const toneIcons: Record<BadgeTone, ReactNode> = {
  neutral: null,
  info: <InfoIcon />,
  success: <CheckIcon />,
  danger: <AlertIcon />,
  highlight: <AlertIcon />,
};

export interface BadgeProps {
  tone?: BadgeTone | undefined;
  children: ReactNode;
  className?: string | undefined;
}

export function Badge({ tone = 'neutral', children, className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-caption font-semibold',
        tones[tone],
        className,
      )}
    >
      {toneIcons[tone]}
      {children}
    </span>
  );
}
