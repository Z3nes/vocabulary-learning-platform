import { render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatDocumentTitle } from '../lib/useDocumentTitle';
import { RouteError } from './RouteError';

afterEach(() => vi.restoreAllMocks());

describe('route error page', () => {
  it.each([false, true])(
    'sets an error title and safe recovery copy (HTTP error: %s)',
    async (httpError) => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      document.title = formatDocumentTitle('Listelerim');
      const router = createMemoryRouter([
        {
          path: '/',
          element: <p>Yükleniyor…</p>,
          loader: () => {
            if (httpError) {
              // React Router uses thrown Responses for HTTP error boundaries.
              // eslint-disable-next-line @typescript-eslint/only-throw-error
              throw new Response('private server detail', { status: 503 });
            }
            throw new Error('private server detail');
          },
          errorElement: <RouteError />,
          hydrateFallbackElement: <p>Yükleniyor…</p>,
        },
      ]);
      render(<RouterProvider router={router} />);

      expect(
        await screen.findByRole('heading', { level: 1, name: 'Bir şeyler ters gitti' }),
      ).toBeDefined();
      await waitFor(() => expect(document.title).toBe(formatDocumentTitle('Sayfa yüklenemedi')));
      expect(screen.getByText(/Lütfen sayfayı yenile[.;]/).textContent).toBe(
        httpError
          ? 'Sayfa yüklenemedi (hata kodu 503). Lütfen sayfayı yenile.'
          : 'Sayfa yüklenemedi. Lütfen sayfayı yenile; sorun sürerse daha sonra tekrar dene.',
      );
      expect(screen.queryByText(/private server detail/)).toBeNull();
      expect(screen.getByRole('link', { name: 'Ana sayfaya dön' }).getAttribute('href')).toBe(
        import.meta.env.BASE_URL,
      );
    },
  );
});
