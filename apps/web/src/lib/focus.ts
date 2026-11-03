import { useEffect, useRef } from 'react';

export const MAIN_CONTENT_ID = 'main';

/**
 * Moves focus to the current page's main heading (falling back to <main>),
 * so screen-reader and keyboard users start at the new content after a route
 * change. The heading becomes programmatically focusable but stays out of the
 * tab order. Scrolling is left to the router's scroll restoration.
 */
export function focusMainHeading() {
  const main = document.getElementById(MAIN_CONTENT_ID);
  if (!main) return;
  const target = main.querySelector<HTMLElement>('h1') ?? main;
  if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
  target.focus({ preventScroll: true });
}

/**
 * Returns a ref that receives focus on mount and whenever `key` changes. Use it
 * for content that replaces the control the student just used (the next
 * question, a finished round), so keyboard focus is not dropped to the page
 * body. A heading target needs `tabIndex={-1}`.
 */
export function useFocusOnChange<T extends HTMLElement>(key: unknown) {
  const ref = useRef<T>(null);
  useEffect(() => {
    ref.current?.focus();
  }, [key]);
  return ref;
}
