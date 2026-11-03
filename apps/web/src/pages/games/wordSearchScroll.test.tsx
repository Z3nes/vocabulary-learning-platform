import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PuzzleBoard } from '../../lib/puzzles';
import { WordSearchBoard } from './WordSearchBoard';

// jsdom has no layout/scrolling engine. Model measured geometry and browser-clamped
// scrolling, then exercise the actual controls, resize subscriptions and selection.
class TestResizeObserver implements ResizeObserver {
  observe = vi.fn<(target: Element) => void>();
  unobserve = vi.fn<(target: Element) => void>();
  disconnect = vi.fn();
  constructor(private callback: ResizeObserverCallback) {
    observers.push(this);
  }
  notify() {
    act(() => this.callback([], this));
  }
}
let observers: TestResizeObserver[], frames: Map<number, FrameRequestCallback>;
beforeEach(() => {
  observers = [];
  frames = new Map();
  let frameId = 0;
  vi.stubGlobal('ResizeObserver', TestResizeObserver);
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    frames.set(++frameId, callback);
    return frameId;
  });
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
    frames.delete(id);
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
const board: PuzzleBoard = {
  rows: 8,
  cols: 8,
  grid: Array<string>(64).fill('A'),
  draft: Array<string>(64).fill(''),
  entries: [
    {
      id: 'a',
      meanings: ['anlam'],
      length: 3,
      segments: [3],
      number: 0,
      solved: false,
      attempts: 0,
    },
  ],
};
const leftButton = () =>
  screen.getByRole<HTMLButtonElement>('button', { name: 'Tahtayı sola kaydır' });
const rightButton = () =>
  screen.getByRole<HTMLButtonElement>('button', { name: 'Tahtayı sağa kaydır' });
function layoutFrame() {
  act(() => {
    const pending = [...frames.values()];
    frames.clear();
    for (const callback of pending) callback(0);
  });
}
function mount(clientWidth = 280, scrollWidth = 640) {
  const select = vi.fn();
  const view = render(<WordSearchBoard board={board} busy={false} select={select} />);
  const viewport = screen.getByRole('region', { name: /Harf tahtası/ });
  const geometry = { clientWidth, scrollWidth, left: 0 };
  Object.defineProperties(viewport, {
    clientWidth: { get: () => geometry.clientWidth },
    scrollWidth: { get: () => geometry.scrollWidth },
    scrollLeft: {
      get: () => geometry.left,
      set: (value: number) => {
        geometry.left = value;
      },
    },
  });
  const scrollBy = vi.fn(({ left = 0 }: ScrollToOptions) => {
    viewport.scrollLeft = Math.max(
      0,
      Math.min(geometry.scrollWidth - geometry.clientWidth, viewport.scrollLeft + left),
    );
    fireEvent.scroll(viewport);
  });
  Object.defineProperty(viewport, 'scrollBy', { value: scrollBy });
  layoutFrame();
  return { ...view, viewport, geometry, scrollBy, select };
}

describe('Word Search horizontal overflow controls', () => {
  it.each([
    [1000, 640],
    [640, 640],
  ])(
    'hides all controls and scrolling help when %i pixels contain %i pixels',
    (available, content) => {
      mount(available, content);
      expect(screen.queryByRole('button', { name: /Tahtayı .* kaydır/ })).toBeNull();
      expect(screen.queryByText(/Dar ekranda ilk harfi/)).toBeNull();
    },
  );
  it('measures after layout and observes both the viewport and intrinsic grid', () => {
    const { viewport } = mount();
    expect(leftButton().disabled).toBe(true);
    expect(rightButton().disabled).toBe(false);
    expect(observers[0]!.observe.mock.calls.map(([element]) => element)).toEqual([
      viewport,
      screen.getByRole('group', { name: 'Kelime Avı harfleri' }),
    ]);
  });
  it('moves the narrow viewport, clamps at its edges and disables only the reached direction', () => {
    const { viewport, scrollBy } = mount();
    fireEvent.click(leftButton());
    expect(scrollBy).not.toHaveBeenCalled();
    fireEvent.click(rightButton());
    expect(viewport.scrollLeft).toBe(240);
    expect(leftButton().disabled).toBe(false);
    expect(rightButton().disabled).toBe(false);
    fireEvent.click(rightButton());
    expect(viewport.scrollLeft).toBe(360);
    expect(rightButton().disabled).toBe(true);
    expect(leftButton().disabled).toBe(false);
    fireEvent.click(rightButton());
    expect(scrollBy).toHaveBeenCalledTimes(2);
    fireEvent.click(leftButton());
    expect(viewport.scrollLeft).toBe(120);
    fireEvent.click(leftButton());
    expect(viewport.scrollLeft).toBe(0);
    expect(leftButton().disabled).toBe(true);
    expect(rightButton().disabled).toBe(false);
    expect(scrollBy).toHaveBeenCalledWith({ left: 240, behavior: 'auto' });
    expect(scrollBy).toHaveBeenCalledWith({ left: -240, behavior: 'auto' });
  });
  it('updates boundaries on native/manual scrolling and fractional or elastic offsets', () => {
    const { viewport, geometry } = mount();
    for (const [position, leftDisabled, rightDisabled] of [
      [-20, true, false],
      [100.25, false, false],
      [359.8, false, true],
      [380, false, true],
    ] as const) {
      geometry.left = position;
      fireEvent.scroll(viewport);
      expect(leftButton().disabled).toBe(leftDisabled);
      expect(rightButton().disabled).toBe(rightDisabled);
    }
  });
  it('shows controls even for one pixel of genuine overflow', () => {
    const { viewport } = mount(639, 640);
    expect(rightButton().disabled).toBe(false);
    fireEvent.click(rightButton());
    expect(viewport.scrollLeft).toBe(1);
    expect(rightButton().disabled).toBe(true);
    expect(leftButton().disabled).toBe(false);
  });
  it('reacts to container-only resizing, including sidebar/layout changes without a window resize', () => {
    const { geometry } = mount(1000, 640);
    geometry.clientWidth = 280;
    observers[0]!.notify();
    expect(rightButton().disabled).toBe(false);
    geometry.clientWidth = 640;
    observers[0]!.notify();
    expect(screen.queryByRole('button', { name: /Tahtayı .* kaydır/ })).toBeNull();
  });
  it('updates the right boundary when the viewport widens but still overflows', () => {
    const { geometry, viewport } = mount();
    geometry.left = 240;
    fireEvent.scroll(viewport);
    expect(rightButton().disabled).toBe(false);
    geometry.clientWidth = 400;
    observers[0]!.notify();
    expect(rightButton().disabled).toBe(true);
  });
  it('recalculates on window resizing and on intrinsic content/font size changes', () => {
    const { geometry } = mount(1000, 640);
    geometry.clientWidth = 320;
    fireEvent.resize(window);
    expect(rightButton().disabled).toBe(false);
    geometry.scrollWidth = 300;
    observers[0]!.notify();
    expect(screen.queryByRole('button', { name: /Tahtayı .* kaydır/ })).toBeNull();
  });
  it('rechecks a changed grid and cleans up observers, events and pending measurements', () => {
    const { geometry, rerender, unmount, viewport } = mount(1000, 640);
    const removeScroll = vi.spyOn(viewport, 'removeEventListener');
    const removeWindow = vi.spyOn(window, 'removeEventListener');
    geometry.scrollWidth = 1200;
    rerender(
      <WordSearchBoard
        board={{ ...board, cols: 16, grid: Array<string>(128).fill('A') }}
        busy={false}
        select={vi.fn()}
      />,
    );
    expect(observers[0]!.disconnect).toHaveBeenCalledOnce();
    layoutFrame();
    expect(rightButton().disabled).toBe(false);
    unmount();
    expect(observers[1]!.disconnect).toHaveBeenCalledOnce();
    expect(removeScroll).toHaveBeenCalledWith('scroll', expect.any(Function));
    expect(removeWindow).toHaveBeenCalledWith('resize', expect.any(Function));
    expect(frames.size).toBe(0);
  });
  it('still responds to window resizing when ResizeObserver is unavailable', () => {
    vi.stubGlobal('ResizeObserver', undefined);
    const { geometry } = mount(1000, 640);
    geometry.clientWidth = 280;
    fireEvent.resize(window);
    expect(rightButton().disabled).toBe(false);
  });
  it('keeps the selected endpoint and grid focus through resize and scrolling', () => {
    const { viewport, geometry, select } = mount(1000, 640);
    const first = viewport.querySelector<HTMLButtonElement>('[data-cell="0"]')!;
    act(() => first.focus());
    fireEvent.click(first, { detail: 0 });
    geometry.clientWidth = 280;
    observers[0]!.notify();
    expect(document.activeElement).toBe(first);
    fireEvent.click(rightButton());
    expect(viewport.scrollLeft).toBe(240);
    expect(screen.getByText(/Başlangıç: satır 1, sütun 1/)).toBeTruthy();
    fireEvent.keyDown(first, { key: 'ArrowRight' });
    const second = viewport.querySelector<HTMLButtonElement>('[data-cell="1"]')!;
    expect(document.activeElement).toBe(second);
    fireEvent.click(second, { detail: 0 });
    expect(select).toHaveBeenCalledWith(0, 1);
  });
});
