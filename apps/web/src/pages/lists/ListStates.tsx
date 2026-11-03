import { ButtonLink } from '../../components/ui/ButtonLink';
import { EmptyState } from '../../components/ui/EmptyState';
import { ListIcon, PlusIcon } from '../../components/ui/icons';
import { ErrorState, LoadingState } from '../../components/ui/states';
import { apiErrorMessage } from '../../lib/apiErrors';

export function ListsEmpty({ headingLevel = 'h2' }: { headingLevel?: 'h2' | 'h3' }) {
  return (
    <EmptyState
      icon={<ListIcon />}
      title="Henüz bir listen yok"
      headingLevel={headingLevel}
      description="Listeler, çalışmak istediğin kelimeleri senin belirlediğin bir başlık altında toplar. İlk listeni oluşturduğunda burada görünecek."
      actions={
        <ButtonLink to="/lists/new" icon={<PlusIcon />}>
          Yeni liste oluştur
        </ButtonLink>
      }
      className="justify-center"
    />
  );
}
export function ListsLoading() {
  return <LoadingState rows={3}>Listelerin yükleniyor…</LoadingState>;
}
export function ListsError({ error, retry }: { error: unknown; retry: () => void }) {
  return <ErrorState message={apiErrorMessage(error)} retry={retry} />;
}
