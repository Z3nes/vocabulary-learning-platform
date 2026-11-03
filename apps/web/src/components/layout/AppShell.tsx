import { useCallback, useEffect, useRef } from 'react';
import { Outlet, ScrollRestoration, useLocation } from 'react-router';
import { focusMainHeading, MAIN_CONTENT_ID } from '../../lib/focus';
import { Wordmark } from '../ui/Wordmark';
import { SkipLink } from './AppHeader';
import { MobileNav } from './MobileNav';
import { DevelopmentNote, PrimaryNav } from './PrimaryNav';

/**
 * After client-side navigation, move focus to the new page's heading. Child
 * effects run first, so the mobile drawer has already closed when this runs.
 * The initial page load keeps the browser's default focus.
 */
function useFocusHeadingOnRouteChange() {
  const { pathname } = useLocation();
  const lastPathname = useRef(pathname);
  useEffect(() => {
    if (lastPathname.current === pathname) return;
    lastPathname.current = pathname;
    focusMainHeading();
    const main = document.getElementById(MAIN_CONTENT_ID);
    if (!main || main.querySelector('h1')) return;
    // A lazy route may still be loading. Focus its heading once it arrives,
    // unless the student has already moved focus elsewhere.
    const observer = new MutationObserver(() => {
      if (!main.querySelector('h1')) return;
      if (document.activeElement === main) focusMainHeading();
      observer.disconnect();
    });
    observer.observe(main, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [pathname]);
}

/**
 * Student-facing layout: a persistent charcoal sidebar from 1024px (`lg`) and a
 * header with a navigation drawer below it. Pages render into <main>.
 */
export function AppShell() {
  const sidebarRef = useRef<HTMLDivElement>(null);
  const { pathname } = useLocation();
  useFocusHeadingOnRouteChange();

  const focusSidebar = useCallback(() => {
    const sidebar = sidebarRef.current;
    const target =
      sidebar?.querySelector<HTMLElement>('a[aria-current="page"]') ??
      sidebar?.querySelector<HTMLElement>('a');
    target?.focus();
  }, []);

  return (
    <>
      <SkipLink targetId={MAIN_CONTENT_ID} />
      <ScrollRestoration />
      <div className="min-h-dvh lg:grid lg:grid-cols-[17.5rem_minmax(0,1fr)]">
        <div ref={sidebarRef} data-surface="dark" className="hidden border-r border-line lg:block">
          <div className="sticky top-0 isolate flex h-dvh flex-col gap-9 overflow-y-auto px-3 pt-6 pb-5">
            {/* A faint brand light at the top of the charcoal sidebar. Decorative only. */}
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-72 bg-[radial-gradient(18rem_12rem_at_0%_0%,rgb(18_98_176/0.28),transparent_70%)]"
            />
            <Wordmark className="px-3" />
            <PrimaryNav />
            <DevelopmentNote className="mx-3 mt-auto" />
          </div>
        </div>

        <div className="relative flex min-w-0 flex-col">
          <MobileNav onSwitchToDesktop={focusSidebar} />
          <main id={MAIN_CONTENT_ID} tabIndex={-1} className="relative isolate flex-1">
            <div aria-hidden="true" className="app-aurora" />
            <div className="relative mx-auto w-full max-w-6xl px-4 pt-6 pb-20 sm:px-6 sm:pt-8 lg:px-10 lg:pt-10">
              {/*
               * Keyed by pathname: every page change mounts a fresh page, so the
               * shared entrance (.route-enter in global.css) runs each time, even
               * between routes that render the same component (/games → /history,
               * /lists/a → /lists/b), and page-local state such as an open dialog
               * never carries over. Hash-only changes (#section) keep the page.
               */}
              <div key={pathname} className="route-enter">
                <Outlet />
              </div>
            </div>
          </main>
        </div>
      </div>
    </>
  );
}
