import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildRoutes } from './router';

// The service-status page calls the health endpoints; keep these tests offline.
beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.reject(new Error('network disabled in tests'))),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderAt(path: string, { basename = '/kelime', includeDevRoutes = false } = {}) {
  const router = createMemoryRouter(buildRoutes({ includeDevRoutes }), {
    basename,
    initialEntries: [path],
  });
  render(<RouterProvider router={router} />);
  return router;
}

// The page is lazy-loaded; the first transform can be slow.
const lazyTimeout = { timeout: 15_000 };

describe('routing under a non-root base path', () => {
  it('renders the dashboard at the base path', async () => {
    renderAt('/kelime/');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Hoş geldin' }, lazyTimeout),
    ).toBeDefined();
  });

  it('shows the not-found page for unknown paths', async () => {
    renderAt('/kelime/olmayan-sayfa');
    expect(await screen.findByRole('heading', { name: 'Sayfa bulunamadı' })).toBeDefined();
  });

  it('serves the design-system preview only when dev routes are enabled', async () => {
    renderAt('/kelime/dev/design-system', { includeDevRoutes: true });
    expect(
      await screen.findByRole(
        'heading',
        { level: 1, name: 'Tasarım sistemi önizlemesi' },
        lazyTimeout,
      ),
    ).toBeDefined();
  });

  it('does not register the preview without dev routes', async () => {
    renderAt('/kelime/dev/design-system', { includeDevRoutes: false });
    expect(await screen.findByRole('heading', { name: 'Sayfa bulunamadı' })).toBeDefined();
  });

  it('serves the service-status page only when dev routes are enabled', async () => {
    renderAt('/kelime/dev/status', { includeDevRoutes: true });
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Servis durumu' }, lazyTimeout),
    ).toBeDefined();
    // The API is unreachable in tests; the page reports that instead of failing.
    expect(await screen.findByText('Ulaşılamıyor')).toBeDefined();
    expect(
      screen.getByRole('link', { name: 'Tasarım sistemi önizlemesi' }).getAttribute('href'),
    ).toBe('/kelime/dev/design-system');
  });

  it('does not register the service-status page without dev routes', async () => {
    renderAt('/kelime/dev/status', { includeDevRoutes: false });
    expect(await screen.findByRole('heading', { name: 'Sayfa bulunamadı' })).toBeDefined();
  });
});
