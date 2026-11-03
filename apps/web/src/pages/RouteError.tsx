import { isRouteErrorResponse, useRouteError } from 'react-router';
import { EmptyState } from '../components/ui/EmptyState';
import { AlertIcon, RefreshIcon } from '../components/ui/icons';
import { useDocumentTitle } from '../lib/useDocumentTitle';

// The router may be the part that failed, so the actions are plain browser
// navigation (a reload and a full-page link), not router links.
const actionBase =
  'inline-flex h-11 items-center justify-center gap-2 rounded-control px-5 font-semibold no-underline ' +
  'transition-[background-color,border-color,color] duration-(--duration-base) ease-standard';

/** Router-level error boundary. Never shows stack traces or internal details. */
export function RouteError() {
  useDocumentTitle('Sayfa yüklenemedi');
  const error = useRouteError();
  const status = isRouteErrorResponse(error) ? error.status : undefined;

  if (import.meta.env.DEV) console.error(error);

  return (
    <main
      id="main"
      className="mx-auto grid min-h-dvh max-w-2xl place-items-center px-4 py-16 sm:px-6"
    >
      <EmptyState
        headingLevel="h1"
        icon={<AlertIcon />}
        title="Bir şeyler ters gitti"
        description={
          status
            ? `Sayfa yüklenemedi (hata kodu ${status}). Lütfen sayfayı yenile.`
            : 'Sayfa yüklenemedi. Lütfen sayfayı yenile; sorun sürerse daha sonra tekrar dene.'
        }
        actions={
          <>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className={`${actionBase} bg-action text-on-action shadow-card hover:bg-action-hover`}
            >
              <RefreshIcon aria-hidden="true" />
              Sayfayı yenile
            </button>
            <a
              href={import.meta.env.BASE_URL}
              className={`${actionBase} border border-line-strong bg-surface-raised text-fg hover:border-accent hover:bg-accent-soft hover:text-on-accent-soft`}
            >
              Ana sayfaya dön
            </a>
          </>
        }
        className="w-full"
      />
    </main>
  );
}
