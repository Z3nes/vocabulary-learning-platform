import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SelectField } from './fields';
import type { SelectFieldProps } from './fields';

const choices = (
  <>
    <option value="">Liste seç</option>
    <option value="one">Algoritmalar</option>
    <option value="blocked" disabled>
      Henüz hazır değil
    </option>
    <option value="two">İngilizce Okumaları</option>
    <option value="three">Işık ve Optik</option>
    <option value="four">İstatistik</option>
  </>
);
function field(props: Partial<SelectFieldProps> = {}) {
  return (
    <SelectField label="Kelime listesi" name="list" {...props}>
      {choices}
    </SelectField>
  );
}
const combo = () => screen.getByRole('combobox', { name: /^Kelime listesi/ });
const key = (value: string) => fireEvent.keyDown(combo(), { key: value });
const current = () => document.getElementById(combo().getAttribute('aria-activedescendant')!);
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('shared single-select interactions', () => {
  it('keeps an uncontrolled initial value consistent with the successful form control when the first option is disabled', () => {
    render(
      <form aria-label="Setup">
        <SelectField label="Kelime listesi" name="list">
          <option value="" disabled>
            Liste seç
          </option>
          <option value="one">Algoritmalar</option>
        </SelectField>
      </form>,
    );
    expect(new FormData(screen.getByRole<HTMLFormElement>('form')).get('list')).toBe('one');
    expect(combo().textContent).toBe('Algoritmalar');
  });

  it('does not resurrect a removed uncontrolled selection when options are later restored', () => {
    const contents = (show: boolean) => (
      <form aria-label="Setup">
        <SelectField label="Kelime listesi" name="list" defaultValue="one">
          <option value="two">İstatistik</option>
          {show ? <option value="one">Algoritmalar</option> : null}
        </SelectField>
      </form>
    );
    const view = render(contents(true));
    view.rerender(contents(false));
    view.rerender(contents(true));
    expect(new FormData(screen.getByRole<HTMLFormElement>('form')).get('list')).toBe('two');
    expect(combo().textContent).toBe('İstatistik');
  });
  it('has one named control, retains the placeholder, and connects hints and errors', () => {
    render(field({ required: true, hint: 'Bir liste belirle.', error: 'Liste gerekli.' }));
    const control = combo();
    expect(control.textContent).toBe('Liste seç');
    expect(control.getAttribute('aria-required')).toBe('true');
    expect(control.getAttribute('aria-invalid')).toBe('true');
    for (const id of control.getAttribute('aria-describedby')!.split(' '))
      expect(document.getElementById(id)).toBeTruthy();
    expect(screen.getAllByRole('combobox')).toHaveLength(1);
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(control.tagName).toBe('BUTTON');
  });

  it.each(['Enter', ' ', 'ArrowDown', 'ArrowUp'])(
    'opens with %s while keeping DOM focus on the combobox',
    (activation) => {
      render(field({ defaultValue: 'one' }));
      combo().focus();
      key(activation);
      const menu = screen.getByRole('listbox', { name: 'Kelime listesi' });
      expect(menu.id).toBe(combo().getAttribute('aria-controls'));
      expect(combo().getAttribute('aria-expanded')).toBe('true');
      expect(document.activeElement).toBe(combo());
      expect(current()?.textContent).toBe('Algoritmalar');
      expect(current()?.getAttribute('aria-selected')).toBe('true');
    },
  );

  it('explores with arrows without changing the value, skips disabled choices, and cancels with Escape', () => {
    const changed = vi.fn();
    render(field({ defaultValue: 'one', onChange: changed }));
    key('ArrowDown');
    key('ArrowDown');
    expect(current()?.textContent).toBe('İngilizce Okumaları');
    expect(combo().textContent).toBe('Algoritmalar');
    key('ArrowUp');
    expect(current()?.textContent).toBe('Algoritmalar');
    key('End');
    key('Escape');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(changed).not.toHaveBeenCalled();
    expect(combo().getAttribute('aria-activedescendant')).toBeNull();
    expect(combo().textContent).toBe('Algoritmalar');
    expect(document.activeElement).toBe(combo());
  });

  it.each(['Enter', ' '])(
    'commits with %s exactly once and preserves the native change event and form value',
    (activation) => {
      const values: string[] = [];
      render(
        <form aria-label="Setup">
          {field({ onChange: (event) => values.push(event.currentTarget.value) })}
        </form>,
      );
      key('Home');
      key('ArrowDown');
      key(activation);
      expect(values).toEqual(['one']);
      expect(combo().textContent).toBe('Algoritmalar');
      expect(new FormData(screen.getByRole<HTMLFormElement>('form')).get('list')).toBe('one');
      expect(document.activeElement).toBe(combo());
      key('Enter');
      key('Enter');
      expect(values).toEqual(['one']);
    },
  );

  it('accepts pointer and assistive-technology clicks, ignores disabled options, and restores focus', () => {
    const changed = vi.fn();
    render(field({ onChange: changed }));
    fireEvent.click(combo());
    fireEvent.click(screen.getByRole('option', { name: 'Henüz hazır değil' }));
    expect(changed).not.toHaveBeenCalled();
    expect(screen.getByRole('listbox')).toBeTruthy();
    fireEvent.click(screen.getByRole('option', { name: 'Işık ve Optik' }), { detail: 0 });
    expect(changed).toHaveBeenCalledOnce();
    expect(combo().textContent).toBe('Işık ve Optik');
    expect(document.activeElement).toBe(combo());
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('commits on Tab without preventing normal focus movement or submitting the form', () => {
    const submit = vi.fn();
    render(
      <form onSubmit={submit}>
        {field()}
        <button>Devam</button>
      </form>,
    );
    key('End');
    const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    fireEvent(combo(), event);
    expect(event.defaultPrevented).toBe(false);
    expect(combo().textContent).toBe('İstatistik');
    const next = screen.getByRole('button', { name: 'Devam' });
    next.focus();
    expect(document.activeElement).toBe(next);
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(submit).not.toHaveBeenCalled();
  });

  it('does not submit the surrounding form when opening, navigating, or selecting', () => {
    const submit = vi.fn();
    render(<form onSubmit={submit}>{field()}</form>);
    fireEvent.click(combo());
    key('ArrowDown');
    key('Enter');
    expect(submit).not.toHaveBeenCalled();
    expect(combo().getAttribute('type')).toBe('button');
  });

  it('supports Turkish dotted/dotless I, multi-character search, repeated characters, and a fresh search after timeout', () => {
    const type = (value: string, time: number) => {
      const event = new KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true });
      Object.defineProperty(event, 'timeStamp', { value: time });
      fireEvent(combo(), event);
    };
    render(field());
    type('İ', 1000);
    expect(current()?.textContent).toBe('İngilizce Okumaları');
    type('İ', 1100);
    expect(current()?.textContent).toBe('İstatistik');
    type('I', 2000);
    expect(current()?.textContent).toBe('Işık ve Optik');
    key('Escape');
    type('İ', 2100);
    type('n', 2200);
    type('g', 2300);
    expect(current()?.textContent).toBe('İngilizce Okumaları');
    key(' ');
    expect(combo().textContent).toBe('İngilizce Okumaları');
  });

  it('leaves modified shortcuts and IME composition alone', () => {
    render(field());
    fireEvent.keyDown(combo(), { key: 'a', ctrlKey: true });
    fireEvent.keyDown(combo(), { key: 'İ', isComposing: true });
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('supports Home/End and PageUp/PageDown on long menus and scrolls the active option locally', () => {
    render(
      <SelectField label="Kelime listesi">
        {Array.from({ length: 30 }, (_, i) => (
          <option key={i} value={i}>
            Liste {i + 1}
          </option>
        ))}
      </SelectField>,
    );
    key('Home');
    const menu = screen.getByRole('listbox');
    const eleventh = screen.getByRole('option', { name: 'Liste 11' });
    Object.defineProperty(menu, 'clientHeight', { configurable: true, value: 100 });
    Object.defineProperty(eleventh, 'offsetTop', { value: 440 });
    Object.defineProperty(eleventh, 'offsetHeight', { value: 44 });
    key('PageDown');
    expect(current()).toBe(eleventh);
    expect(menu.scrollTop).toBe(384);
    Object.defineProperty(menu, 'clientHeight', { configurable: true, value: 60 });
    fireEvent.resize(window);
    expect(menu.scrollTop).toBe(424);
    key('End');
    expect(current()?.textContent).toBe('Liste 30');
    key('ArrowDown');
    expect(current()?.textContent).toBe('Liste 30');
    key('PageUp');
    expect(current()?.textContent).toBe('Liste 20');
    key('Home');
    key('ArrowUp');
    expect(current()?.textContent).toBe('Liste 1');
  });

  it('dismisses on outside pointer input, blur and page scroll without taking outside focus or committing', () => {
    const changed = vi.fn();
    render(
      <>
        {field({ onChange: changed })}
        <button>Dışarı</button>
      </>,
    );
    const outside = screen.getByRole('button', { name: 'Dışarı' });
    key('End');
    fireEvent.pointerDown(outside);
    outside.focus();
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(document.activeElement).toBe(outside);
    key('Home');
    fireEvent.scroll(screen.getByRole('listbox'));
    expect(screen.getByRole('listbox')).toBeTruthy();
    fireEvent.scroll(document);
    expect(screen.queryByRole('listbox')).toBeNull();
    key('End');
    fireEvent.blur(combo(), { relatedTarget: outside });
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(changed).not.toHaveBeenCalled();
  });

  it('preserves controlled values, callbacks, asynchronous option updates, and disabled/loading state', () => {
    const changed = vi.fn();
    function Controlled({ disabled = false }: { disabled?: boolean }) {
      const [value, setValue] = useState('one');
      return field({
        value,
        disabled,
        'aria-busy': disabled,
        onChange: (event) => {
          changed(event.currentTarget.value);
          setValue(event.currentTarget.value);
        },
      });
    }
    const view = render(<Controlled />);
    key('End');
    key('Enter');
    expect(changed).toHaveBeenCalledWith('four');
    expect(combo().textContent).toBe('İstatistik');
    key('Enter');
    view.rerender(<Controlled disabled />);
    expect(combo().hasAttribute('disabled')).toBe(true);
    expect(combo().getAttribute('aria-busy')).toBe('true');
    expect(screen.queryByRole('listbox')).toBeNull();
    fireEvent.click(combo());
    expect(screen.queryByRole('listbox')).toBeNull();
    view.rerender(<Controlled />);
    expect(combo().textContent).toBe('İstatistik');
    expect(combo().getAttribute('aria-expanded')).toBe('false');
  });

  it('closes safely when an active option disappears and displays the updated selected label', () => {
    const view = render(field({ value: 'one' }));
    key('End');
    view.rerender(
      <SelectField label="Kelime listesi" value="one">
        <option value="one">Güncel başlık</option>
      </SelectField>,
    );
    expect(combo().textContent).toBe('Güncel başlık');
    expect(combo().getAttribute('aria-activedescendant')).toBeNull();
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('keeps the unsupported-popover fallback inside its native dialog without adding a focus trap', () => {
    render(
      <dialog open aria-label="Liste ayarı">
        {field()}
        <button>Kapat</button>
      </dialog>,
    );
    key('Enter');
    const dialog = screen.getByRole('dialog');
    const menu = within(dialog).getByRole('listbox');
    expect(menu.hasAttribute('popover')).toBe(false);
    expect(document.activeElement).toBe(combo());
    key('Tab');
    expect(screen.queryByRole('listbox')).toBeNull();
    const close = within(dialog).getByRole('button', { name: 'Kapat' });
    close.focus();
    expect(document.activeElement).toBe(close);
  });

  it('uses the native top layer when Popover is supported and removes its menu on close', () => {
    const previous = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'showPopover');
    const show = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'showPopover', {
      configurable: true,
      value: show,
    });
    const view = render(field());
    try {
      key('Enter');
      expect(show).toHaveBeenCalledOnce();
      // The stub records promotion; jsdom cannot model the native :popover-open state.
      expect(screen.getByRole('listbox', { hidden: true }).getAttribute('popover')).toBe('manual');
      key('Escape');
      expect(screen.queryByRole('listbox', { hidden: true })).toBeNull();
      expect(document.activeElement).toBe(combo());
    } finally {
      view.unmount();
      if (previous) Object.defineProperty(HTMLElement.prototype, 'showPopover', previous);
      else Reflect.deleteProperty(HTMLElement.prototype, 'showPopover');
    }
  });

  it('keeps required validation visible and focusable and respects form reset', () => {
    render(
      <form aria-label="Setup">
        {field({ required: true })}
        <button type="reset">Sıfırla</button>
      </form>,
    );
    const form = screen.getByRole<HTMLFormElement>('form');
    act(() => {
      expect(form.checkValidity()).toBe(false);
    });
    expect(screen.getByRole('alert').textContent).toBe('Bir seçenek seç.');
    expect(combo().getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(combo());
    key('End');
    key('Enter');
    expect(form.checkValidity()).toBe(true);
    expect(screen.queryByRole('alert')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Sıfırla' }));
    expect(combo().textContent).toBe('Liste seç');
    expect(new FormData(form).get('list')).toBe('');
  });

  it('keeps native option text as the submitted value when a separate display label is supplied', () => {
    const changed = vi.fn();
    render(
      <form aria-label="Setup">
        <SelectField
          label="Kelime listesi"
          name="list"
          onChange={(event) => {
            changed(event.currentTarget.value);
          }}
        >
          <option value="">Liste seç</option>
          <option label="Görünen başlık">stored-title</option>
        </SelectField>
      </form>,
    );
    key('End');
    key('Enter');
    expect(combo().textContent).toBe('Görünen başlık');
    expect(changed).toHaveBeenCalledWith('stored-title');
    expect(new FormData(screen.getByRole<HTMLFormElement>('form')).get('list')).toBe(
      'stored-title',
    );
  });

  it('retains complete long labels and positions a scrollable menu above a low trigger at narrow widths', () => {
    const rect = { top: 430, bottom: 474, left: 16, right: 304, width: 288, height: 44 };
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      ...rect,
      x: 16,
      y: 430,
      toJSON: () => ({}),
    });
    vi.stubGlobal('innerHeight', 500);
    vi.stubGlobal('innerWidth', 320);
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(600);
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(336);
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(288);
    const long = 'Çok uzun bir Türkçe kelime listesi başlığı — ' + 'Algoritmalar '.repeat(20);
    render(
      <SelectField label="Kelime listesi">
        <option value="long">{long}</option>
      </SelectField>,
    );
    fireEvent.click(combo());
    const menu = screen.getByRole('listbox');
    expect(menu.style.width).toBe('288px');
    expect(menu.style.maxHeight).toBe('336px');
    expect(menu.style.top).toBe('88px');
    expect(menu.style.left).toBe('16px');
    expect(within(menu).getByRole('option').textContent).toBe(long);
    expect(combo().textContent).toBe(long);
    vi.stubGlobal('innerWidth', 280);
    fireEvent.resize(window);
    expect(menu.style.width).toBe('264px');
    expect(menu.style.left).toBe('8px');
  });
});
