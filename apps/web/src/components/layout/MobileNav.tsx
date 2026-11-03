import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { MouseEvent } from 'react';
import { useHref, useLocation } from 'react-router';
import { CrossIcon, MenuIcon } from '../ui/icons';
import { Wordmark } from '../ui/Wordmark';
import { DevelopmentNote, PrimaryNav } from './PrimaryNav';

/** Tailwind's `lg` breakpoint (1024px): from here on the persistent sidebar is shown. */
export const DESKTOP_MEDIA_QUERY = '(min-width: 64rem)';

/**
 * Why the drawer closes decides where focus goes:
 * - user: back to the menu button (close button, backdrop, Escape, current-page link);
 * - navigation: the app shell moves focus to the new page's heading;
 * - desktop: the persistent sidebar, because the menu button is hidden there.
 */
type CloseReason = 'user' | 'navigation' | 'desktop';

const iconButton =
  'inline-flex h-11 min-w-11 items-center justify-center gap-2 rounded-control text-fg ' +
  'transition-colors duration-(--duration-fast) ease-standard hover:bg-surface-raised ' +
  'focus-visible:outline-[3px] focus-visible:outline-offset-2';

export interface MobileNavProps {
  /** Moves focus into the desktop sidebar after the drawer closes on a resize. */
  onSwitchToDesktop: () => void;
}

/**
 * Header bar and navigation drawer below 1024px. The drawer is a native modal
 * <dialog>: the browser makes the rest of the page inert, contains focus and
 * handles Escape, so no custom focus trap is needed. Background scrolling is
 * locked in CSS (see `.app-drawer` in global.css).
 */
export function MobileNav({ onSwitchToDesktop }: MobileNavProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  // Set while our code closes the dialog, so the native close event leaves focus alone.
  const closingFromCode = useRef(false);
  const [open, setOpen] = useState(false);
  const drawerId = useId();
  const { pathname } = useLocation();
  const currentHref = useHref(pathname);

  const closeDrawer = useCallback(
    (reason: CloseReason) => {
      const dialog = dialogRef.current;
      if (!dialog?.open) return;
      closingFromCode.current = true;
      dialog.close();
      if (reason === 'user') triggerRef.current?.focus();
      else if (reason === 'desktop') onSwitchToDesktop();
    },
    [onSwitchToDesktop],
  );

  const openDrawer = () => {
    const dialog = dialogRef.current;
    if (!dialog || dialog.open) return;
    dialog.showModal();
    setOpen(true);
    // Start on the current page's link so the user sees where they are.
    const target =
      dialog.querySelector<HTMLElement>('nav a[aria-current="page"]') ??
      dialog.querySelector<HTMLElement>('nav a');
    target?.focus();
  };

  // Fires for every close, including Escape handled by the browser.
  const handleClose = () => {
    setOpen(false);
    if (closingFromCode.current) {
      closingFromCode.current = false;
      return;
    }
    triggerRef.current?.focus();
  };

  const handleDialogClick = (event: MouseEvent<HTMLDialogElement>) => {
    // The content fills the dialog box, so a click on the <dialog> itself is the backdrop.
    if (event.target === event.currentTarget) {
      closeDrawer('user');
      return;
    }
    // A router link to the page that is already open does not change the route,
    // so the route effect below would not close the drawer.
    const link = (event.target as Element).closest('a');
    if (link && event.defaultPrevented && link.getAttribute('href') === currentHref) {
      closeDrawer('user');
    }
  };

  // Close after navigation (links, browser back/forward).
  const lastPathname = useRef(pathname);
  useEffect(() => {
    if (lastPathname.current === pathname) return;
    lastPathname.current = pathname;
    closeDrawer('navigation');
  }, [pathname, closeDrawer]);

  // Close when the viewport grows into the desktop layout.
  useEffect(() => {
    const query = window.matchMedia(DESKTOP_MEDIA_QUERY);
    const onChange = (event: MediaQueryListEvent) => {
      if (event.matches) closeDrawer('desktop');
    };
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, [closeDrawer]);

  return (
    <>
      <header data-surface="dark" className="sticky top-0 z-30 border-b border-line lg:hidden">
        <div className="flex h-16 items-center gap-2 px-3 sm:gap-4 sm:px-5">
          <button
            ref={triggerRef}
            type="button"
            aria-haspopup="dialog"
            aria-expanded={open}
            aria-controls={drawerId}
            onClick={openDrawer}
            className={`${iconButton} px-3`}
          >
            <MenuIcon className="text-[1.35rem]" />
            <span className="text-body font-semibold">Menü</span>
          </button>
          <Wordmark className="min-w-0" />
        </div>
      </header>

      <dialog
        ref={dialogRef}
        id={drawerId}
        aria-label="Ana menü"
        data-surface="dark"
        className="app-drawer"
        onClose={handleClose}
        onClick={handleDialogClick}
      >
        <div className="flex min-h-full flex-col gap-6 px-3 pt-3 pb-6">
          <div className="flex items-center justify-between gap-3 pl-3">
            <Wordmark />
            <button
              type="button"
              aria-label="Menüyü kapat"
              onClick={() => closeDrawer('user')}
              className={iconButton}
            >
              <CrossIcon className="text-[1.35rem]" />
            </button>
          </div>
          <PrimaryNav />
          <DevelopmentNote className="mx-3 mt-auto" />
        </div>
      </dialog>
    </>
  );
}
