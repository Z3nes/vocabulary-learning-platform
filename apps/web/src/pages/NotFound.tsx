import { ButtonLink } from '../components/ui/ButtonLink';
import { EmptyState } from '../components/ui/EmptyState';
import { DashboardIcon, ListIcon, SearchIcon } from '../components/ui/icons';
import { useDocumentTitle } from '../lib/useDocumentTitle';

/** Unknown route inside the app shell, so the navigation stays available. */
export function NotFound() {
  useDocumentTitle('Sayfa bulunamadı');

  return (
    <EmptyState
      headingLevel="h1"
      icon={<SearchIcon />}
      title="Sayfa bulunamadı"
      description="Aradığın sayfa taşınmış ya da hiç var olmamış olabilir. Bağlantıyı kontrol et veya aşağıdaki sayfalardan devam et."
      actions={
        <>
          <ButtonLink to="/" icon={<DashboardIcon />}>
            Kontrol paneline dön
          </ButtonLink>
          <ButtonLink to="/lists" variant="secondary" icon={<ListIcon />}>
            Listelerine git
          </ButtonLink>
        </>
      }
      className="mx-auto max-w-2xl bg-surface-raised py-14"
    />
  );
}
