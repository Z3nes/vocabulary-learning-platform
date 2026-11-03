import { useId } from 'react';
import type { InputHTMLAttributes, ReactNode, Ref } from 'react';
import { cn } from '../../lib/cn';
import { AlertIcon, CheckIcon } from './icons';
import { SelectControl } from './SelectControl';
import type { SelectControlProps } from './SelectControl';

/**
 * Raised fields: white fill, a ≥ 3:1 border, a faint inner shadow, and on focus
 * the focus color as border plus a soft halo (the global outline stays, at offset 0).
 */
const controlBase =
  'block w-full rounded-control border bg-surface-raised text-body text-fg ' +
  'shadow-[inset_0_1px_2px_rgb(13_19_33/0.05)] ' +
  'transition-[border-color,box-shadow,background-color] duration-(--duration-fast) ease-standard ' +
  'placeholder:text-fg-muted ' +
  'enabled:hover:border-fg/70 ' +
  'focus-visible:outline-offset-0 focus-visible:border-focus focus-visible:shadow-[0_0_0_5px_rgb(18_98_176/0.14)] ' +
  'disabled:cursor-not-allowed disabled:border-transparent disabled:bg-disabled disabled:text-on-disabled disabled:shadow-none';

const controlBorder = (invalid: boolean) =>
  invalid ? 'border-danger shadow-[0_0_0_1px_var(--sem-danger)]' : 'border-line-strong';

interface FieldFrameProps {
  id: string;
  label: string;
  hint?: ReactNode | undefined;
  error?: ReactNode | undefined;
  required?: boolean | undefined;
  children: ReactNode;
}

function FieldFrame({ id, label, hint, error, required, children }: FieldFrameProps) {
  return (
    <div className="grid gap-2">
      <label htmlFor={id} className="text-small font-semibold text-fg">
        {label}
        {required ? <span className="ml-1 font-normal text-fg-muted">(zorunlu)</span> : null}
      </label>
      {children}
      {hint ? (
        <p id={`${id}-hint`} className="text-small text-fg-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p
          id={`${id}-error`}
          className="flex items-start gap-1.5 text-small font-medium text-danger"
        >
          <AlertIcon className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  );
}

function describedBy(id: string, hint: unknown, error: unknown): string | undefined {
  const ids = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean);
  return ids.length ? ids.join(' ') : undefined;
}

export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  label: string;
  hint?: ReactNode;
  error?: ReactNode;
  ref?: Ref<HTMLInputElement>;
}

export function TextField({ label, hint, error, required, className, ...props }: TextFieldProps) {
  const id = useId();
  return (
    <FieldFrame id={id} label={label} hint={hint} error={error} required={required}>
      <input
        id={id}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        className={cn(controlBase, controlBorder(Boolean(error)), 'h-12 px-4', className)}
        {...props}
      />
    </FieldFrame>
  );
}

export interface SelectFieldProps extends Omit<SelectControlProps, 'id' | 'invalid'> {
  label: string;
  hint?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
}

export function SelectField({
  label,
  hint,
  error,
  required,
  className,
  children,
  ...props
}: SelectFieldProps) {
  const id = useId();
  return (
    <FieldFrame id={id} label={label} hint={hint} error={error} required={required}>
      <SelectControl
        id={id}
        label={label}
        required={required}
        invalid={Boolean(error)}
        aria-describedby={describedBy(id, hint, error)}
        className={cn(
          controlBase,
          controlBorder(Boolean(error)),
          'min-h-12 cursor-pointer gap-3 py-2.5 pr-3 pl-4 font-medium',
          className,
        )}
        {...props}
      >
        {children}
      </SelectControl>
    </FieldFrame>
  );
}

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'type'> {
  label: string;
  hint?: ReactNode;
}

/** Native checkbox with a custom ≥3:1 box; the native input keeps keyboard and form behavior. */
export function Checkbox({ label, hint, className, ...props }: CheckboxProps) {
  const id = useId();
  return (
    <div className={cn('flex items-start gap-3', className)}>
      <span className="relative mt-0.5 grid size-5 shrink-0 place-items-center">
        <input
          id={id}
          type="checkbox"
          aria-describedby={hint ? `${id}-hint` : undefined}
          className={
            'peer size-5 cursor-pointer appearance-none rounded-[0.3rem] border-2 border-line-strong bg-surface-raised ' +
            'transition-colors duration-(--duration-fast) ease-standard ' +
            'checked:border-action checked:bg-action enabled:hover:border-fg enabled:checked:hover:border-action-hover enabled:checked:hover:bg-action-hover ' +
            'disabled:cursor-not-allowed disabled:border-on-disabled disabled:bg-disabled'
          }
          {...props}
        />
        <CheckIcon
          strokeWidth={3}
          className="pointer-events-none absolute size-3.5 scale-50 text-on-action opacity-0 transition-[opacity,scale] duration-(--duration-fast) ease-emphasized peer-checked:scale-100 peer-checked:opacity-100 peer-disabled:text-on-disabled"
        />
      </span>
      <span className="grid gap-0.5">
        <label htmlFor={id} className="cursor-pointer text-body text-fg">
          {label}
        </label>
        {hint ? (
          <span id={`${id}-hint`} className="text-small text-fg-muted">
            {hint}
          </span>
        ) : null}
      </span>
    </div>
  );
}
