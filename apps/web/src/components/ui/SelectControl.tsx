import { Children, isValidElement, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { KeyboardEvent, OptionHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../../lib/cn';
import { CheckIcon, ChevronDownIcon } from './icons';

interface Option {
  value: string;
  label: string;
  disabled: boolean;
}

function optionText(children: ReactNode): string {
  return Children.toArray(children)
    .map((child) =>
      isValidElement<{ children?: ReactNode }>(child)
        ? optionText(child.props.children)
        : typeof child === 'string' || typeof child === 'number' || typeof child === 'bigint'
          ? String(child)
          : '',
    )
    .join('');
}

function readOptions(children: ReactNode, disabled = false): Option[] {
  return Children.toArray(children).flatMap((child) => {
    if (!isValidElement<OptionHTMLAttributes<HTMLOptionElement>>(child)) return [];
    if (child.type === 'option') {
      const text = optionText(child.props.children);
      const label = child.props.label ?? text;
      return [
        {
          value: String(child.props.value ?? text),
          label,
          disabled: disabled || !!child.props.disabled,
        },
      ];
    }
    return readOptions(child.props.children, disabled || !!child.props.disabled);
  });
}

function scrollActiveOption(menu: HTMLElement) {
  const option = menu.querySelector<HTMLElement>('[aria-selected="true"]');
  if (!option) return;
  // Scroll only the menu, never the page (including at browser zoom).
  if (option.offsetTop < menu.scrollTop) menu.scrollTop = option.offsetTop;
  else if (option.offsetTop + option.offsetHeight > menu.scrollTop + menu.clientHeight)
    menu.scrollTop = option.offsetTop + option.offsetHeight - menu.clientHeight;
}

export interface SelectControlProps extends Omit<
  SelectHTMLAttributes<HTMLSelectElement>,
  'id' | 'multiple' | 'size'
> {
  id: string;
  label: string;
  invalid?: boolean;
}

/** Single-select combobox; the native control retains form data, reset and change events. */
export function SelectControl({
  id,
  label,
  invalid,
  className,
  children,
  value,
  defaultValue,
  disabled,
  required,
  onChange,
  onInvalid,
  ...props
}: SelectControlProps) {
  const options = readOptions(children);
  const [localValue, setLocalValue] = useState(String(defaultValue ?? options[0]?.value ?? ''));
  const requestedValue = value === undefined ? localValue : String(value);
  const selected =
    options.find((option) => option.value === requestedValue) ??
    options.find((option) => !option.disabled);
  const selectedValue = selected?.value ?? '';
  const enabled = options.filter((option) => !option.disabled);
  const [active, setActive] = useState<string | null>(null);
  const [portalHost, setPortalHost] = useState<HTMLElement | null>(null);
  const [invalidMessage, setInvalidMessage] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const native = useRef<HTMLSelectElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const search = useRef({ text: '', time: 0 });
  const open = active !== null && !disabled;
  const supportsPopover = typeof HTMLElement.prototype.showPopover === 'function';
  const activeIndex = options.findIndex((option) => option.value === active);
  const listId = `${id}-options`;
  const validationId = `${id}-validation`;
  const description =
    [props['aria-describedby'], invalidMessage ? validationId : null].filter(Boolean).join(' ') ||
    undefined;

  // An in-flight request can disable the field or replace its options while open.
  if (active !== null && (disabled || !enabled.some((option) => option.value === active)))
    setActive(null);

  function expand(
    next = selected?.disabled ? enabled[0]?.value : (selected?.value ?? enabled[0]?.value),
  ) {
    if (!disabled && next !== undefined) {
      search.current = { text: '', time: 0 };
      setPortalHost(trigger.current?.closest('dialog') ?? document.body);
      setActive(next);
      trigger.current?.focus({ preventScroll: true });
    }
  }

  function commit(next: string, restoreFocus: boolean) {
    setActive(null);
    if (restoreFocus) trigger.current?.focus({ preventScroll: true });
    const control = native.current;
    if (
      !control ||
      disabled ||
      !enabled.some((option) => option.value === next) ||
      control.value === next
    )
      return;
    control.value = next;
    control.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function keyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.nativeEvent.isComposing || event.ctrlKey || event.metaKey || disabled) return;
    const index = enabled.findIndex((option) => option.value === active);
    const move = (target: number) => {
      const option = enabled[Math.max(0, Math.min(enabled.length - 1, target))];
      if (option) {
        if (open) setActive(option.value);
        else expand(option.value);
      }
    };
    if (event.key === 'Escape') {
      if (open) {
        event.preventDefault();
        event.stopPropagation();
        setActive(null);
      }
    } else if (event.key === 'Tab') {
      if (active !== null) commit(active, false);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (open && active !== null) commit(active, true);
      else expand();
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) expand();
      else if (event.altKey && event.key === 'ArrowUp' && active !== null) commit(active, true);
      else move(index + (event.key === 'ArrowDown' ? 1 : -1));
    } else if (['Home', 'End', 'PageUp', 'PageDown'].includes(event.key)) {
      event.preventDefault();
      if (event.key === 'Home') move(0);
      else if (event.key === 'End') move(enabled.length - 1);
      else move(index + (event.key === 'PageDown' ? 10 : -10));
    } else if (!event.altKey && event.key.length === 1) {
      event.preventDefault();
      const now = event.timeStamp;
      const previous = open && now - search.current.time < 700 ? search.current.text : '';
      const text = (previous + event.key).toLocaleLowerCase('tr-TR');
      search.current = { text, time: now };
      const repeated = [...text].every((character) => character === text[0]);
      const prefix = repeated ? text[0]! : text;
      const start = previous && !repeated ? Math.max(0, index) : index + 1;
      for (let offset = 0; offset < enabled.length; offset++) {
        const option = enabled[(start + offset) % enabled.length]!;
        if (option.label.trim().toLocaleLowerCase('tr-TR').startsWith(prefix)) {
          setActive(option.value);
          setPortalHost(trigger.current?.closest('dialog') ?? document.body);
          trigger.current?.focus({ preventScroll: true });
          break;
        }
      }
    }
  }

  useLayoutEffect(() => {
    if (!open || !popup.current || !trigger.current) return;
    const menu = popup.current;
    const button = trigger.current;
    menu.dataset['surface'] =
      button.closest<HTMLElement>('[data-surface]')?.dataset['surface'] ?? 'light';
    // Popover promotes the menu above clipping ancestors and native modal dialogs.
    menu.showPopover?.();
    const position = () => {
      const rect = button.getBoundingClientRect();
      const viewport = window.visualViewport;
      const left = viewport?.offsetLeft ?? 0;
      const top = viewport?.offsetTop ?? 0;
      const width = viewport?.width ?? window.innerWidth;
      const height = viewport?.height ?? window.innerHeight;
      const gutter = 8;
      const below = top + height - rect.bottom - gutter - 6;
      const above = rect.top - top - gutter - 6;
      const upwards = below < Math.min(menu.scrollHeight, 240) && above > below;
      const available = Math.max(0, upwards ? above : below);
      menu.style.width = `${Math.min(rect.width, width - gutter * 2)}px`;
      menu.style.maxHeight = `${Math.min(336, available)}px`;
      menu.style.left = `${Math.max(left + gutter, Math.min(rect.left, left + width - menu.offsetWidth - gutter))}px`;
      menu.style.top = `${upwards ? Math.max(top + gutter, rect.top - menu.offsetHeight - 6) : Math.max(top + gutter, Math.min(rect.bottom + 6, top + height - menu.offsetHeight - gutter))}px`;
      scrollActiveOption(menu);
    };
    position();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(position);
    observer?.observe(button);
    observer?.observe(menu);
    window.addEventListener('resize', position);
    window.visualViewport?.addEventListener('resize', position);
    window.visualViewport?.addEventListener('scroll', position);
    const dismiss = (event: Event) => {
      if (
        event.target instanceof Node &&
        !button.contains(event.target) &&
        !menu.contains(event.target)
      )
        setActive(null);
    };
    const scroll = (event: Event) => {
      if (!(event.target instanceof Node) || !menu.contains(event.target)) setActive(null);
    };
    document.addEventListener('pointerdown', dismiss, true);
    document.addEventListener('scroll', scroll, true);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', position);
      window.visualViewport?.removeEventListener('resize', position);
      window.visualViewport?.removeEventListener('scroll', position);
      document.removeEventListener('pointerdown', dismiss, true);
      document.removeEventListener('scroll', scroll, true);
    };
  }, [open, children]);

  useLayoutEffect(() => {
    const menu = popup.current;
    if (menu) scrollActiveOption(menu);
  }, [open, activeIndex, children]);

  const resetValue = String(
    defaultValue ?? options.find((option) => !option.disabled)?.value ?? '',
  );
  // Uncontrolled native selects can choose another option after mount or after
  // option removal. Mirror that actual form value before painting the trigger.
  useLayoutEffect(() => {
    if (value === undefined && native.current) setLocalValue(native.current.value);
  }, [children, value]);
  useEffect(() => {
    const form = native.current?.form;
    const reset = () => {
      setLocalValue(resetValue);
      setActive(null);
      setInvalidMessage(false);
    };
    form?.addEventListener('reset', reset);
    return () => form?.removeEventListener('reset', reset);
  }, [resetValue]);

  const menu = open ? (
    <div
      id={listId}
      ref={popup}
      popover={supportsPopover ? 'manual' : undefined}
      role="listbox"
      aria-label={label}
      className="select-popup"
      onMouseDown={(event) => event.preventDefault()}
    >
      {options.map((option, index) => (
        <div
          key={option.value}
          id={`${listId}-${index}`}
          role="option"
          aria-selected={option.value === active}
          aria-disabled={option.disabled || undefined}
          data-index={index}
          data-current={option.value === selectedValue || undefined}
          className="select-option"
          onClick={() => {
            if (!option.disabled) commit(option.value, true);
          }}
        >
          <span className="min-w-0 flex-1 wrap-anywhere">{option.label}</span>
          {option.value === selectedValue ? <CheckIcon className="shrink-0" /> : null}
        </div>
      ))}
    </div>
  ) : null;

  return (
    <>
      <select
        {...props}
        ref={native}
        hidden
        tabIndex={-1}
        aria-hidden="true"
        value={value}
        defaultValue={defaultValue}
        disabled={disabled}
        required={required}
        onChange={(event) => {
          setLocalValue(event.currentTarget.value);
          setInvalidMessage(false);
          onChange?.(event);
        }}
        onInvalid={(event) => {
          event.preventDefault();
          setInvalidMessage(true);
          trigger.current?.focus();
          onInvalid?.(event);
        }}
      >
        {options.map((option) => (
          <option
            key={option.value}
            value={option.value}
            label={option.label}
            disabled={option.disabled}
          />
        ))}
      </select>
      <button
        id={id}
        ref={trigger}
        type="button"
        role="combobox"
        autoFocus={props.autoFocus}
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open && activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
        aria-required={required || undefined}
        aria-invalid={invalid || invalidMessage || undefined}
        aria-describedby={description}
        aria-label={props['aria-label']}
        aria-labelledby={props['aria-labelledby']}
        aria-busy={props['aria-busy']}
        className={cn('select-trigger', className)}
        onKeyDown={keyDown}
        onClick={() => {
          if (open) setActive(null);
          else expand();
        }}
        onBlur={() => setActive(null)}
      >
        <span className="min-w-0 flex-1 wrap-anywhere text-left">
          {selected?.label ?? 'Seçenek seç'}
        </span>
        <span aria-hidden="true" className="select-chevron">
          <ChevronDownIcon />
        </span>
      </button>
      {menu && (supportsPopover ? menu : createPortal(menu, portalHost ?? document.body))}
      {invalidMessage ? (
        <p id={validationId} role="alert" className="text-small text-danger">
          Bir seçenek seç.
        </p>
      ) : null}
    </>
  );
}
