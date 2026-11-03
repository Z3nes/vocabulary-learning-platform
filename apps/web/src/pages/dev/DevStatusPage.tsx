import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { AppHeader, SkipLink } from '../../components/layout/AppHeader';
import { Badge } from '../../components/ui/Badge';
import type { BadgeTone } from '../../components/ui/Badge';
import { Card } from '../../components/ui/Card';
import { fetchServiceStatus } from '../../lib/api';
import type { DatabaseStatus, ServiceStatus } from '../../lib/api';
import { useDocumentTitle } from '../../lib/useDocumentTitle';

type StatusState =
  { kind: 'loading' } | { kind: 'ready'; status: ServiceStatus } | { kind: 'unavailable' };

const databaseLabels: Record<DatabaseStatus, { text: string; tone: BadgeTone }> = {
  reachable: { text: 'Bağlı', tone: 'success' },
  unreachable: { text: 'Ulaşılamıyor', tone: 'danger' },
  not_configured: { text: 'Yapılandırılmadı', tone: 'neutral' },
};

function useServiceStatus(): StatusState {
  const [state, setState] = useState<StatusState>({ kind: 'loading' });
  useEffect(() => {
    const controller = new AbortController();
    fetchServiceStatus(controller.signal).then(
      (status) => setState({ kind: 'ready', status }),
      () => {
        if (!controller.signal.aborted) setState({ kind: 'unavailable' });
      },
    );
    return () => controller.abort();
  }, []);
  return state;
}

/**
 * Development-only diagnostics (API and database health). Registered only in
 * development builds, like the design-system preview; never shown to students.
 */
export function DevStatusPage() {
  useDocumentTitle('Servis durumu');
  const state = useServiceStatus();

  return (
    <>
      <SkipLink />
      <AppHeader>
        <Badge tone="info">Yalnızca geliştirme ortamı</Badge>
      </AppHeader>
      <main id="main" tabIndex={-1} className="mx-auto grid max-w-3xl gap-8 px-4 py-12 sm:px-6">
        <div className="grid gap-3">
          <p className="text-small">
            <Link to="/" className="font-semibold">
              ← Kontrol paneli
            </Link>
          </p>
          <h1 className="text-h1 text-fg">Servis durumu</h1>
          <p className="max-w-prose text-body-lg text-fg-muted">
            Geliştirme sırasında API ve veritabanı bağlantısını kontrol etmek içindir. Bu sayfa
            üretim sürümüne dahil edilmez.
          </p>
        </div>

        <Card as="section" aria-labelledby="service-status-title">
          <h2 id="service-status-title" className="text-h4 text-fg">
            Bağlantılar
          </h2>
          <dl className="mt-4 grid gap-3 text-body">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <dt className="text-fg">API</dt>
              <dd aria-live="polite">
                {state.kind === 'loading' ? (
                  <Badge>Kontrol ediliyor…</Badge>
                ) : state.kind === 'ready' ? (
                  <Badge tone="success">Çalışıyor</Badge>
                ) : (
                  <Badge tone="danger">Ulaşılamıyor</Badge>
                )}
              </dd>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <dt className="text-fg">Veritabanı</dt>
              <dd aria-live="polite">
                {state.kind === 'ready' ? (
                  <Badge tone={databaseLabels[state.status.database].tone}>
                    {databaseLabels[state.status.database].text}
                  </Badge>
                ) : state.kind === 'loading' ? (
                  <Badge>Kontrol ediliyor…</Badge>
                ) : (
                  <Badge>Bilinmiyor</Badge>
                )}
              </dd>
            </div>
          </dl>
        </Card>

        <p className="text-body text-fg">
          Diğer geliştirici araçları:{' '}
          <Link to="/dev/design-system" className="font-semibold">
            Tasarım sistemi önizlemesi
          </Link>
        </p>
      </main>
    </>
  );
}
