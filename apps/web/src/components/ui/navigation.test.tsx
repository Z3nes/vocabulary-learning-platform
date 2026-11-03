import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import { LinkCard } from './Card';
import { Breadcrumbs, TopNav } from './navigation';
import { SidebarNav, SidebarNavItem } from './SidebarNav';

const items = [
  { to: '/', end: true, label: 'Kontrol paneli' },
  { to: '/listeler', label: 'Listelerim' },
  { to: '/gecmis', label: 'Geçmiş' },
];

function Harness() {
  return (
    <>
      <SidebarNav label="Kenar gezinmesi">
        {items.map((item) => (
          <SidebarNavItem key={item.to} to={item.to} {...(item.end ? { end: true } : {})}>
            {item.label}
          </SidebarNavItem>
        ))}
      </SidebarNav>
      <TopNav label="Üst gezinme" items={items} />
      <Breadcrumbs items={[{ label: 'Kontrol paneli', to: '/' }, { label: 'Listelerim' }]} />
      <LinkCard to="/listeler" title="Listelere git" />
      <LinkCard href="#bolum" title="Sayfa içi bölüm" />
      <LinkCard href="https://example.org/" title="Dış bağlantı" />
    </>
  );
}

function renderAt(path: string) {
  const router = createMemoryRouter([{ path: '*', element: <Harness /> }], {
    basename: '/kelime',
    initialEntries: [path],
  });
  const view = render(<RouterProvider router={router} />);
  return { router, ...view };
}

const nav = (name: string) => within(screen.getByRole('navigation', { name }));

describe('SidebarNavItem', () => {
  it('marks only the current route with aria-current="page" and prefixes the basename', () => {
    renderAt('/kelime/listeler');
    const sidebar = nav('Kenar gezinmesi');

    const active = sidebar.getByRole('link', { name: 'Listelerim' });
    expect(active.getAttribute('aria-current')).toBe('page');
    expect(active.getAttribute('href')).toBe('/kelime/listeler');

    // "end" keeps the index route from matching every path.
    expect(sidebar.getByRole('link', { name: 'Kontrol paneli' }).hasAttribute('aria-current')).toBe(
      false,
    );
    expect(sidebar.getByRole('link', { name: 'Geçmiş' }).hasAttribute('aria-current')).toBe(false);
  });

  it('renders the non-color active indicator only for the active item', () => {
    const { container } = renderAt('/kelime/listeler');
    const sidebarNav = container.querySelector('nav[aria-label="Kenar gezinmesi"]')!;
    const indicators = sidebarNav.querySelectorAll('.bg-selected-indicator');
    expect(indicators).toHaveLength(1);
    expect(indicators[0]!.closest('a')?.textContent).toBe('Listelerim');
  });

  it('draws the active fill on the link itself, with bold white text and a decorative bar', () => {
    renderAt('/kelime/listeler');
    const sidebarNav = screen.getByRole('navigation', { name: 'Kenar gezinmesi' });
    const active = nav('Kenar gezinmesi').getByRole('link', { name: 'Listelerim' });

    expect(sidebarNav.querySelectorAll('.bg-selected')).toHaveLength(1);
    expect(sidebarNav.querySelector('.bg-selected')).toBe(active);
    expect(active.classList.contains('text-on-selected')).toBe(true);
    expect(active.classList.contains('font-semibold')).toBe(true);

    // Every link owns exactly one decorative bar; only the active one is colored.
    for (const link of within(sidebarNav).getAllByRole('link')) {
      const bars = link.querySelectorAll(':scope > span[aria-hidden="true"].pointer-events-none');
      expect(bars).toHaveLength(1);
      const isActive = link === active;
      expect(bars[0]!.classList.contains('bg-selected-indicator')).toBe(isActive);
      expect(bars[0]!.classList.contains('bg-transparent')).toBe(!isActive);
      if (!isActive) {
        expect(link.classList.contains('font-medium')).toBe(true);
        expect(link.classList.contains('text-fg-muted')).toBe(true);
      }
    }
  });

  it('changes the selection with a short color transition only: no movement or press scale', () => {
    renderAt('/kelime/listeler');
    const sidebarNav = screen.getByRole('navigation', { name: 'Kenar gezinmesi' });
    const transition = [
      'transition-[color,background-color]',
      'duration-(--duration-fast)',
      'ease-standard',
    ];

    for (const link of within(sidebarNav).getAllByRole('link')) {
      const bar = link.querySelector(':scope > span[aria-hidden="true"]')!;
      for (const element of [link, bar]) {
        for (const name of transition) expect(element.classList.contains(name)).toBe(true);
        // Only colors transition: no transform, layout, outline or scale changes.
        expect(element.className).not.toMatch(/transition-(all|transform)|translate|scale-/);
      }
    }
    // No inline styles: nothing is positioned or projected by JavaScript.
    expect(sidebarNav.querySelectorAll('[style]')).toHaveLength(0);
  });

  it('updates the selection in place without remounting items', () => {
    renderAt('/kelime/listeler');
    const sidebarNav = screen.getByRole('navigation', { name: 'Kenar gezinmesi' });
    const sidebar = within(sidebarNav);
    const links = sidebar.getAllByRole('link');
    const bars = links.map((link) => link.querySelector(':scope > span[aria-hidden="true"]'));

    act(() => {
      fireEvent.click(sidebar.getByRole('link', { name: 'Geçmiş' }));
    });

    // Same elements, new classes: the browser transitions colors on the existing nodes.
    expect(sidebar.getAllByRole('link')).toEqual(links);
    expect(sidebar.getAllByRole('link').map((link) => link.querySelector(':scope > span'))).toEqual(
      bars,
    );
    const current = sidebar.getByRole('link', { name: 'Geçmiş' });
    expect(current.classList.contains('bg-selected')).toBe(true);
    expect(
      sidebar.getByRole('link', { name: 'Listelerim' }).classList.contains('bg-selected'),
    ).toBe(false);
  });

  it('keeps a single selection through rapid destinations and back/forward navigation', async () => {
    const { router } = renderAt('/kelime/listeler');
    const sidebarNav = screen.getByRole('navigation', { name: 'Kenar gezinmesi' });
    const sidebar = within(sidebarNav);
    const assertSelection = (label: string) => {
      const current = sidebar.getByRole('link', { name: label });
      expect(sidebarNav.querySelectorAll('a[aria-current="page"]')).toHaveLength(1);
      expect(current.getAttribute('aria-current')).toBe('page');
      expect(sidebarNav.querySelectorAll('.bg-selected')).toHaveLength(1);
      expect(sidebarNav.querySelectorAll('.bg-selected-indicator')).toHaveLength(1);
      expect(sidebarNav.querySelector('.bg-selected')?.closest('a')).toBe(current);
      expect(sidebarNav.querySelector('.bg-selected-indicator')?.closest('a')).toBe(current);
    };

    // No animation waits: routing can interrupt the previous shared-layout move.
    for (const label of ['Geçmiş', 'Kontrol paneli', 'Geçmiş', 'Listelerim']) {
      act(() => {
        fireEvent.click(sidebar.getByRole('link', { name: label }));
      });
      assertSelection(label);
    }
    await act(() => router.navigate(-1));
    assertSelection('Geçmiş');
    await act(() => router.navigate(1));
    assertSelection('Listelerim');
  });

  it('removes both selection cues on an unmatched route and restores them together on back', async () => {
    const { router } = renderAt('/kelime/listeler');
    const sidebarNav = screen.getByRole('navigation', { name: 'Kenar gezinmesi' });
    await act(() => router.navigate('/missing'));
    expect(sidebarNav.querySelectorAll('a[aria-current="page"]')).toHaveLength(0);
    expect(sidebarNav.querySelectorAll('.bg-selected, .bg-selected-indicator')).toHaveLength(0);

    await act(() => router.navigate(-1));
    expect(sidebarNav.querySelectorAll('.bg-selected')).toHaveLength(1);
    expect(sidebarNav.querySelectorAll('.bg-selected-indicator')).toHaveLength(1);
    expect(sidebarNav.querySelector('.bg-selected')?.closest('a')?.textContent).toBe('Listelerim');
  });

  it('navigates client-side and moves the active state', () => {
    const { router } = renderAt('/kelime/listeler');
    const sidebar = nav('Kenar gezinmesi');

    act(() => {
      fireEvent.click(sidebar.getByRole('link', { name: 'Geçmiş' }));
    });

    expect(router.state.location.pathname).toBe('/kelime/gecmis');
    expect(sidebar.getByRole('link', { name: 'Geçmiş' }).getAttribute('aria-current')).toBe('page');
    expect(sidebar.getByRole('link', { name: 'Listelerim' }).hasAttribute('aria-current')).toBe(
      false,
    );
  });
});

describe('TopNav', () => {
  it('follows the router and includes the basename', () => {
    renderAt('/kelime/');
    const top = nav('Üst gezinme');
    const home = top.getByRole('link', { name: 'Kontrol paneli' });
    expect(home.getAttribute('aria-current')).toBe('page');
    expect(home.getAttribute('href')).toBe('/kelime');
    expect(top.getByRole('link', { name: 'Listelerim' }).getAttribute('href')).toBe(
      '/kelime/listeler',
    );
  });
});

describe('Breadcrumbs and LinkCard', () => {
  it('use router links for routes and keep native anchors for fragments and external URLs', () => {
    renderAt('/kelime/listeler');
    const crumbs = nav('Sayfa konumu');
    expect(crumbs.getByRole('link', { name: 'Kontrol paneli' }).getAttribute('href')).toBe(
      '/kelime',
    );
    expect(crumbs.getByText('Listelerim').getAttribute('aria-current')).toBe('page');

    expect(screen.getByRole('link', { name: /Listelere git/ }).getAttribute('href')).toBe(
      '/kelime/listeler',
    );
    expect(screen.getByRole('link', { name: /Sayfa içi bölüm/ }).getAttribute('href')).toBe(
      '#bolum',
    );
    expect(screen.getByRole('link', { name: /Dış bağlantı/ }).getAttribute('href')).toBe(
      'https://example.org/',
    );
  });
});
