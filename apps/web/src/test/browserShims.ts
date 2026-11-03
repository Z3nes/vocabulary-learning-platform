// Minimal stand-ins for browser APIs that jsdom lacks. They model only what the
// app relies on; real behavior (focus containment, Escape, inertness, CSS) is
// verified in a real browser, not here. Test files running in the Node
// environment (no DOM) skip the installation.

const hasDom = typeof window !== 'undefined';

// ---- <dialog> ---------------------------------------------------------------

if (hasDom && !('showModal' in HTMLDialogElement.prototype)) {
  Object.assign(HTMLDialogElement.prototype, {
    showModal(this: HTMLDialogElement) {
      this.setAttribute('open', '');
    },
    show(this: HTMLDialogElement) {
      this.setAttribute('open', '');
    },
    close(this: HTMLDialogElement) {
      if (!this.hasAttribute('open')) return;
      this.removeAttribute('open');
      // Browsers fire "close" asynchronously; tests await it via waitFor.
      setTimeout(() => this.dispatchEvent(new Event('close')), 0);
    },
  });
}

// ---- matchMedia ---------------------------------------------------------------

type ChangeListener = (event: MediaQueryListEvent) => void;
const mediaListeners = new Map<string, Set<ChangeListener>>();
let desktopViewport = false;

const DESKTOP_QUERY = '(min-width: 64rem)';

function matches(query: string): boolean {
  return query === DESKTOP_QUERY ? desktopViewport : false;
}

function matchMediaShim(query: string): MediaQueryList {
  const listeners = mediaListeners.get(query) ?? new Set<ChangeListener>();
  mediaListeners.set(query, listeners);
  return {
    get matches() {
      return matches(query);
    },
    media: query,
    onchange: null,
    addEventListener: (_type: string, listener: ChangeListener) => listeners.add(listener),
    removeEventListener: (_type: string, listener: ChangeListener) => listeners.delete(listener),
    addListener: (listener: ChangeListener) => listeners.add(listener),
    removeListener: (listener: ChangeListener) => listeners.delete(listener),
    dispatchEvent: () => true,
  } as unknown as MediaQueryList;
}

if (hasDom) window.matchMedia = matchMediaShim;

/** Simulates resizing across the 1024px navigation breakpoint. */
export function setDesktopViewport(isDesktop: boolean) {
  desktopViewport = isDesktop;
  for (const listener of mediaListeners.get(DESKTOP_QUERY) ?? []) {
    listener({ matches: isDesktop, media: DESKTOP_QUERY } as MediaQueryListEvent);
  }
}

export function resetViewport() {
  desktopViewport = false;
}

// ---- scrolling ------------------------------------------------------------------

// React Router's <ScrollRestoration> scrolls on navigation; jsdom has no layout.
if (hasDom) window.scrollTo = () => {};
