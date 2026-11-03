import { useId } from 'react';
import type { InputHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';
import { SearchIcon } from './icons';

export interface SearchFieldProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'id' | 'type' | 'className'
> {
  /** Accessible name; also shown as the placeholder so the visible text matches it. */
  label: string;
  className?: string | undefined;
}

/** Compact filter input (type="search": Escape and the native clear button empty it). */
export function SearchField({ label, className, ...props }: SearchFieldProps) {
  const id = useId();
  return (
    <div className={cn('relative', className)}>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <SearchIcon className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-[1.15rem] text-fg-muted" />
      <input
        id={id}
        type="search"
        placeholder={label}
        autoComplete="off"
        spellCheck={false}
        className="block h-11 w-full rounded-full border border-line-strong bg-surface-raised pr-4 pl-10 text-body text-fg shadow-[inset_0_1px_2px_rgb(13_19_33/0.05)] transition-[border-color,box-shadow] duration-(--duration-fast) ease-standard placeholder:text-fg-muted hover:border-fg/70 focus-visible:border-focus focus-visible:shadow-[0_0_0_5px_rgb(18_98_176/0.14)] focus-visible:outline-offset-0"
        {...props}
      />
    </div>
  );
}
