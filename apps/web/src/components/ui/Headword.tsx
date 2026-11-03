import type { HTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

/**
 * English vocabulary is set like a dictionary headword: the serif stack shared
 * with /tanitim, at a medium weight. Turkish text stays in the interface font,
 * so the two languages are distinguishable at a glance (never by color alone).
 * Use the class directly on elements that already exist, e.g. an `<h2 lang="en">`.
 */
export const headwordClass = 'font-headword font-medium [font-feature-settings:normal]';

type HeadwordTag = 'span' | 'p' | 'strong' | 'h2' | 'h3' | 'dd';

export interface HeadwordProps extends HTMLAttributes<HTMLElement> {
  as?: HeadwordTag;
}

/** An English word or phrase; always marked `lang="en"` for pronunciation. */
export function Headword({ as: Tag = 'span', className, ...props }: HeadwordProps) {
  return <Tag lang="en" className={cn(headwordClass, className)} {...props} />;
}
