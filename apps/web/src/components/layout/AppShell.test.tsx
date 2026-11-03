import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatDocumentTitle } from '../../lib/useDocumentTitle';
import { buildRoutes } from '../../router';
import { setDesktopViewport } from '../../test/browserShims';

const fetchMock = vi.fn(() =>
  Promise.resolve(
    new Response(JSON.stringify({ lists: [] }), {
      headers: { 'content-type': 'application/json' },
    }),
  ),
);

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  document.title = '';
});

afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockClear();
});

function renderApp(path = '/kelime/', basename = '/kelime') {
  const router = createMemoryRouter(buildRoutes({ includeDevRoutes: false }), {
    basename,
    initialEntries: [path],
  });
  render(<RouterProvider router={router} />);
  return router;
}

const drawer = () => document.querySelector('dialog')!;
const menuButton = () => screen.getByRole('button', { name: 'Menü' });

/** The persistent sidebar's navigation (the drawer holds a second copy). */
function desktopNav() {
  const nav = [...document.querySelectorAll('nav[aria-label="Ana gezinme"]')].find(
    (element) => !element.closest('dialog'),
  );
  if (!(nav instanceof HTMLElement)) throw new Error('desktop navigation not found');
  return within(nav);
}

function drawerNav() {
  const nav = drawer().querySelector('nav');
  if (!nav) throw new Error('drawer navigation not found');
  return within(nav);
}

describe('dashboard', () => {
  it('renders at the base path with a greeting, title and active navigation item', async () => {
    renderApp();
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Hoş geldin' }, { timeout: 15000 }),
    ).toBeDefined();
    await waitFor(() => expect(document.title).toBe(formatDocumentTitle('Kontrol Paneli')));

    const home = desktopNav().getByRole('link', { name: 'Kontrol Paneli' });
    expect(home.getAttribute('aria-current')).toBe('page');
    expect(home.getAttribute('href')).toBe('/kelime');
    expect(desktopNav().getByRole('link', { name: 'Alıştırmalar' }).getAttribute('href')).toBe(
      '/kelime/games',
    );
  });

  it('shows persisted empty lists and available study modes without diagnostics', async () => {
    renderApp();
    await screen.findByRole('heading', { level: 1, name: 'Hoş geldin' });

    expect(await screen.findByRole('heading', { name: 'Henüz bir listen yok' })).toBeDefined();
    expect(screen.getByRole('link', { name: 'Yeni liste oluştur' }).getAttribute('href')).toBe(
      '/kelime/lists/new',
    );

    // All study modes are available, so no status badges are needed: each mode is
    // reachable through exactly one link named after it.
    expect(screen.queryAllByText(/Yakında|Kullanıma açık/)).toHaveLength(0);
    const methods = within(screen.getByRole('region', { name: 'Çalışma yöntemleri' }));
    for (const name of [
      'Kelime kartları',
      'Yazılı Cevap',
      'Dinle ve Yaz',
      'Zorlandıklarımı Çalış',
      'Karma Çalışma',
      'Klasik test',
      'Eşleştirme',
      'Hafıza Oyunu',
      'Kelime Oluşturma',
      'Kelime Avı',
      'Çapraz Bulmaca',
    ])
      expect(methods.getAllByRole('link', { name })).toHaveLength(1);

    expect(screen.queryByText(/Servis durumu|Veritabanı/)).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('keeps a skip link to the focusable main landmark', async () => {
    renderApp();
    await screen.findByRole('heading', { level: 1, name: 'Hoş geldin' });
    expect(screen.getByRole('link', { name: 'Ana içeriğe geç' }).getAttribute('href')).toBe(
      '#main',
    );
    const main = screen.getByRole('main');
    expect(main.id).toBe('main');
    expect(main.getAttribute('tabindex')).toBe('-1');
  });
});

// DOM checks complement the token-contrast suite. jsdom cannot verify pixel
// layout, native dialog focus containment, visual focus rings or animation.
describe('student page accessibility structure', () => {
  it.each(['', 'lists', 'lists/new', 'study', 'games', 'history', 'missing-page'])(
    'keeps landmarks, names, heading order and ARIA references valid at /%s',
    async (path) => {
      renderApp(`/kelime/${path}`);
      await screen.findByRole('heading', { level: 1 }, { timeout: 15000 });
      const main = screen.getByRole('main');
      await within(main).findByRole('heading', { level: 1 });
      expect(screen.getAllByRole('main')).toHaveLength(1);
      expect(within(main).getAllByRole('heading', { level: 1 })).toHaveLength(1);
      expect(screen.getByRole('link', { name: 'Ana içeriğe geç' }).getAttribute('href')).toBe(
        `#${main.id}`,
      );

      let previousLevel = 0;
      for (const heading of within(main).getAllByRole('heading')) {
        const level = Number(heading.tagName.slice(1));
        expect(level).toBeLessThanOrEqual(previousLevel + 1);
        previousLevel = level;
      }

      for (const role of ['link', 'button', 'navigation'] as const) {
        expect(screen.getAllByRole(role, { name: /\S/ })).toHaveLength(
          screen.getAllByRole(role).length,
        );
      }

      const ids = [...document.querySelectorAll('[id]')].map((element) => element.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const attribute of ['aria-labelledby', 'aria-describedby', 'aria-controls']) {
        for (const element of document.querySelectorAll(`[${attribute}]`)) {
          for (const id of element.getAttribute(attribute)!.split(/\s+/)) {
            expect(document.getElementById(id), `${attribute} target ${id}`).not.toBeNull();
          }
        }
      }
    },
  );
});

describe('client-side navigation', () => {
  it('preserves both navigation instances across distant routes and back/forward', async () => {
    const router = renderApp('/kelime/history');
    await screen.findByRole('heading', { level: 1, name: 'Çalışma Geçmişi' });
    const sidebar = document.querySelector('nav');
    const mobileNav = drawer().querySelector('nav');

    for (const path of ['games', 'lists', 'history', 'study', 'games']) {
      await act(() => router.navigate(`/${path}`));
      expect(document.querySelector('nav')).toBe(sidebar);
      expect(drawer().querySelector('nav')).toBe(mobileNav);
      await waitFor(() => {
        for (const nav of [sidebar!, mobileNav!]) {
          const active = nav.querySelectorAll('a[aria-current="page"]');
          expect(active).toHaveLength(1);
          expect(active[0]!.getAttribute('href')).toBe(`/kelime/${path}`);
          expect(nav.querySelectorAll('.bg-selected-indicator')).toHaveLength(1);
        }
      });
    }

    await act(() => router.navigate(-1));
    expect(
      desktopNav().getByRole('link', { name: 'Kelime Çalış' }).getAttribute('aria-current'),
    ).toBe('page');
    await act(() => router.navigate(1));
    expect(
      desktopNav().getByRole('link', { name: 'Alıştırmalar' }).getAttribute('aria-current'),
    ).toBe('page');
    expect(document.querySelector('nav')).toBe(sidebar);
    expect(drawer().querySelector('nav')).toBe(mobileNav);
  });

  it('updates the title, active item and focus without leaving the app', async () => {
    const router = renderApp();
    await screen.findByRole('heading', { level: 1, name: 'Hoş geldin' });

    act(() => {
      fireEvent.click(desktopNav().getByRole('link', { name: 'Listelerim' }));
    });

    const heading = await screen.findByRole('heading', { level: 1, name: 'Listelerim' });
    expect(router.state.location.pathname).toBe('/kelime/lists');
    expect(document.activeElement).toBe(heading);
    expect(document.title).toBe(formatDocumentTitle('Listelerim'));
    expect(
      desktopNav().getByRole('link', { name: 'Listelerim' }).getAttribute('aria-current'),
    ).toBe('page');
    expect(
      desktopNav().getByRole('link', { name: 'Kontrol Paneli' }).hasAttribute('aria-current'),
    ).toBe(false);
  });

  it('renders the study hub (no longer a placeholder) at /kelime/study', async () => {
    renderApp('/kelime/study');
    expect(await screen.findByRole('heading', { level: 1, name: 'Kelime Çalış' })).toBeDefined();
    expect(screen.queryByText('Geliştirme aşamasında')).toBeNull();
    expect(await screen.findByRole('heading', { name: 'Henüz bir listen yok' })).toBeDefined();
    await waitFor(() => expect(document.title).toBe(formatDocumentTitle('Kelime Çalış')));
  });

  it.each([
    ['/kelime/games', 'Alıştırmalar'],
    ['/kelime/history', 'Çalışma Geçmişi'],
  ])('renders the implemented page at %s', async (path, title) => {
    renderApp(path);
    expect(await screen.findByRole('heading', { level: 1, name: title })).toBeDefined();
    expect(screen.queryByText('Geliştirme aşamasında')).toBeNull();
    await waitFor(() => expect(document.title).toBe(formatDocumentTitle(title)));
  });

  it('works at the root base path', async () => {
    renderApp('/', '/');
    await screen.findByRole('heading', { level: 1, name: 'Hoş geldin' });
    expect(desktopNav().getByRole('link', { name: 'Listelerim' }).getAttribute('href')).toBe(
      '/lists',
    );
  });

  it('shows the not-found page inside the app shell', async () => {
    renderApp('/kelime/olmayan-sayfa');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Sayfa bulunamadı' }),
    ).toBeDefined();
    expect(desktopNav().getByRole('link', { name: 'Kontrol Paneli' })).toBeDefined();
    await waitFor(() => expect(document.title).toBe(formatDocumentTitle('Sayfa bulunamadı')));
  });
});

// The entrance itself is CSS (global.css, covered by global.motion.test.ts); jsdom
// cannot run it. These tests cover the keyed wrapper that triggers it.
describe('route entrance', () => {
  function page() {
    const wrappers = screen.getByRole('main').querySelectorAll('.route-enter');
    expect(wrappers).toHaveLength(1);
    return wrappers[0]!;
  }

  const heading = (name: string) => screen.findByRole('heading', { level: 1, name });

  it('mounts a fresh page for every navigation while the shell stays in place', async () => {
    const router = renderApp();
    await heading('Hoş geldin');
    const sidebar = document.querySelector('nav')!;
    const mobileHeader = menuButton().closest('header')!;
    let previous = page();
    expect(previous.contains(sidebar)).toBe(false);
    expect(previous.contains(mobileHeader)).toBe(false);

    for (const [path, title] of [
      ['/lists', 'Listelerim'],
      ['/games', 'Alıştırmalar'],
      ['/history', 'Çalışma Geçmişi'],
      ['/study', 'Kelime Çalış'],
      ['/', 'Hoş geldin'],
    ] as const) {
      await act(() => router.navigate(path));
      const current = await heading(title);
      expect(page()).not.toBe(previous);
      expect(page().contains(current)).toBe(true);
      expect(document.activeElement).toBe(current);
      previous = page();
    }
    expect(document.querySelector('nav')).toBe(sidebar);
    expect(menuButton().closest('header')).toBe(mobileHeader);
  });

  it('remounts routes that render the same component and focuses the new heading', async () => {
    const router = renderApp('/kelime/games');
    const games = await heading('Alıştırmalar');
    const before = page();

    await act(() => router.navigate('/history'));
    const history = await heading('Çalışma Geçmişi');
    // Without the pathname key React would reuse the same ComingSoonPage elements.
    expect(page()).not.toBe(before);
    expect(history).not.toBe(games);
    expect(games.isConnected).toBe(false);
    expect(document.activeElement).toBe(history);
    await waitFor(() => expect(document.title).toBe(formatDocumentTitle('Çalışma Geçmişi')));
  });

  it('remounts and focuses the heading on back and forward navigation', async () => {
    const router = renderApp('/kelime/games');
    await heading('Alıştırmalar');
    await act(() => router.navigate('/history'));
    await heading('Çalışma Geçmişi');
    const historyPage = page();

    await act(() => router.navigate(-1));
    const games = await heading('Alıştırmalar');
    expect(page()).not.toBe(historyPage);
    expect(document.activeElement).toBe(games);

    const gamesPage = page();
    await act(() => router.navigate(1));
    const history = await heading('Çalışma Geçmişi');
    expect(page()).not.toBe(gamesPage);
    expect(document.activeElement).toBe(history);
  });

  it('keeps the page and focus on a hash-only change and lets the router scroll to it', async () => {
    // jsdom has no scrollIntoView; React Router calls it for the hash target.
    const original = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollIntoView');
    const scrollIntoView = vi.fn();
    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      configurable: true,
      writable: true,
      value: scrollIntoView,
    });
    try {
      const router = renderApp();
      const welcome = await heading('Hoş geldin');
      const before = page();
      const focused = document.activeElement;

      await act(() => router.navigate('/#calisma-yontemleri'));
      expect(router.state.location.hash).toBe('#calisma-yontemleri');
      expect(page()).toBe(before);
      expect(welcome.isConnected).toBe(true);
      expect(document.activeElement).toBe(focused);
      expect(scrollIntoView).toHaveBeenCalled();
      expect(scrollIntoView.mock.contexts.at(-1)).toBe(
        document.getElementById('calisma-yontemleri'),
      );
    } finally {
      if (original) Object.defineProperty(Element.prototype, 'scrollIntoView', original);
      else Reflect.deleteProperty(Element.prototype, 'scrollIntoView');
    }
  });
});

describe('mobile navigation drawer', () => {
  async function openDrawer() {
    renderApp();
    await screen.findByRole('heading', { level: 1, name: 'Hoş geldin' });
    act(() => {
      fireEvent.click(menuButton());
    });
    expect(drawer().open).toBe(true);
  }

  it('opens as a dialog and moves focus to the current page link', async () => {
    await openDrawer();
    expect(menuButton().getAttribute('aria-expanded')).toBe('true');
    expect(menuButton().getAttribute('aria-controls')).toBe(drawer().id);
    expect(document.activeElement).toBe(drawerNav().getByRole('link', { name: 'Kontrol Paneli' }));
  });

  it('closes with the close button and returns focus to the menu button', async () => {
    await openDrawer();
    act(() => {
      fireEvent.click(within(drawer()).getByRole('button', { name: 'Menüyü kapat' }));
    });
    expect(drawer().open).toBe(false);
    expect(document.activeElement).toBe(menuButton());
    await waitFor(() => expect(menuButton().getAttribute('aria-expanded')).toBe('false'));
    expect(document.activeElement).toBe(menuButton());
  });

  it('returns focus to the menu button when the browser closes it (Escape)', async () => {
    await openDrawer();
    // A native Escape closes the dialog without our code; only the close event follows.
    act(() => drawer().close());
    await waitFor(() => expect(document.activeElement).toBe(menuButton()));
    expect(menuButton().getAttribute('aria-expanded')).toBe('false');
  });

  it('closes on a backdrop click', async () => {
    await openDrawer();
    act(() => {
      fireEvent.click(drawer());
    });
    expect(drawer().open).toBe(false);
    expect(document.activeElement).toBe(menuButton());
  });

  it('closes after navigating and focuses the new page heading', async () => {
    await openDrawer();
    act(() => {
      fireEvent.click(drawerNav().getByRole('link', { name: 'Kelime Çalış' }));
    });

    const heading = await screen.findByRole('heading', { level: 1, name: 'Kelime Çalış' });
    expect(drawer().open).toBe(false);
    expect(document.activeElement).toBe(heading);
    // The asynchronous close event must not pull focus back to the menu button.
    await waitFor(() => expect(menuButton().getAttribute('aria-expanded')).toBe('false'));
    expect(document.activeElement).toBe(heading);
  });

  it('closes when the current page link is chosen again', async () => {
    await openDrawer();
    act(() => {
      fireEvent.click(drawerNav().getByRole('link', { name: 'Kontrol Paneli' }));
    });
    expect(drawer().open).toBe(false);
    expect(document.activeElement).toBe(menuButton());
  });

  it('closes when the viewport reaches the desktop layout and focuses the sidebar', async () => {
    await openDrawer();
    act(() => setDesktopViewport(true));
    expect(drawer().open).toBe(false);
    expect(document.activeElement).toBe(desktopNav().getByRole('link', { name: 'Kontrol Paneli' }));
    await waitFor(() => expect(menuButton().getAttribute('aria-expanded')).toBe('false'));
    expect(document.activeElement).toBe(desktopNav().getByRole('link', { name: 'Kontrol Paneli' }));
  });
});
