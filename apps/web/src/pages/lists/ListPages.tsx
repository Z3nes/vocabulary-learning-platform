import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Button } from '../../components/ui/Button';
import { ButtonLink } from '../../components/ui/ButtonLink';
import { Card } from '../../components/ui/Card';
import { ArrowRightIcon, CardsIcon, PlusIcon } from '../../components/ui/icons';
import { ListCover } from '../../components/ui/ListCover';
import { PageHeader } from '../../components/ui/PageHeader';
import { SearchField } from '../../components/ui/SearchField';
import { StatusNotice } from '../../components/ui/StatusNotice';
import { useCreateList, useLists, type WordList } from '../../lib/lists';
import { matchesSearch, searchKey } from '../../lib/search';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import { ListDialog, type ListDialogTarget } from './ListDialog';
import { ListsEmpty, ListsError, ListsLoading } from './ListStates';
import { TitleForm } from './TitleForm';
export { ListDetailPage } from '../words/ListDetailPage';

const dateFormat = new Intl.DateTimeFormat('tr-TR', { dateStyle: 'medium' });

/** From this many lists on, a title filter helps more than it clutters. */
const FILTER_FROM = 7;

export function ListsPage() {
  useDocumentTitle('Listelerim');
  const lists = useLists();
  const [target, setTarget] = useState<ListDialogTarget>();
  const [notice, setNotice] = useState('');
  // Once used, keep the search mounted even if deletions reduce the list count.
  // Clearing it must not remove the focused input.
  const [query, setQuery] = useState<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const key = searchKey(query ?? '');
  const visible = lists.data?.filter((list) => matchesSearch(key, [list.title])) ?? [];
  const open = (list: WordList, action: ListDialogTarget['action'], trigger: HTMLElement) => {
    setNotice('');
    setTarget({ list, action, trigger });
  };
  return (
    <div className="grid gap-7">
      <PageHeader
        headingRef={heading}
        title="Listelerim"
        description="Kendi başlıklarınla oluşturduğun kelime listelerini burada yönet."
        actions={
          lists.data?.length ? (
            <ButtonLink to="/lists/new" icon={<PlusIcon />}>
              Yeni liste oluştur
            </ButtonLink>
          ) : null
        }
      />
      <StatusNotice message={notice} />
      {lists.isPending ? (
        <ListsLoading />
      ) : lists.isError ? (
        <ListsError
          error={lists.error}
          retry={() => {
            void lists.refetch();
          }}
        />
      ) : lists.data.length === 0 ? (
        <ListsEmpty />
      ) : (
        <div className="grid gap-4">
          {lists.data.length >= FILTER_FROM || query !== null ? (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <SearchField
                label="Listelerde ara"
                value={query ?? ''}
                onFocus={() => setQuery((value) => value ?? '')}
                onChange={(event) => setQuery(event.target.value)}
                className="w-full sm:max-w-sm"
              />
              <p aria-live="polite" className="text-small text-fg-muted">
                {key ? `${visible.length} / ${lists.data.length} liste gösteriliyor` : ''}
              </p>
            </div>
          ) : null}
          {visible.length ? (
            <ul className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
              {visible.map((list) => (
                <ListCard key={list.id} list={list} open={open} />
              ))}
            </ul>
          ) : (
            <p className="rounded-card border border-dashed border-line-strong bg-surface-raised px-5 py-6 text-body text-fg">
              “{query?.trim()}” ile eşleşen bir liste yok. Aramayı değiştir ya da temizle.
            </p>
          )}
        </div>
      )}
      {target ? (
        <ListDialog
          key={`${target.action}-${target.list.id}`}
          target={target}
          close={() => {
            setTarget(undefined);
          }}
          onDeleted={() => {
            setNotice('Listen silindi.');
            heading.current?.focus();
          }}
        />
      ) : null}
    </div>
  );
}

function ListCard({
  list,
  open,
}: {
  list: WordList;
  open: (list: WordList, action: ListDialogTarget['action'], trigger: HTMLElement) => void;
}) {
  return (
    <Card
      as="li"
      padded={false}
      // Hover and press feedback live in global.css (.list-card): they react only
      // to the stretched link, never to the action controls layered above it.
      className="list-card relative isolate grid content-start"
    >
      <div className="flex items-start gap-3.5 p-5">
        {/* The same colored cover as on the dashboard, so a list is recognizable everywhere. */}
        <ListCover id={list.id} title={list.title} size="sm" />
        <div className="grid min-w-0 flex-1 gap-1">
          <h2 className="min-w-0 text-h3 wrap-anywhere">
            <Link
              className="list-card-link text-fg no-underline after:absolute after:inset-0 after:rounded-card"
              to={`/lists/${list.id}`}
            >
              {list.title}
            </Link>
          </h2>
          <p className="text-small text-fg-muted">
            {list.wordCount} kelime · Son düzenleme:{' '}
            <time dateTime={list.updatedAt}>{dateFormat.format(new Date(list.updatedAt))}</time>
          </p>
        </div>
        {/* Non-color cue that the card opens; covered by the link's stretched area. */}
        <ArrowRightIcon className="list-card-arrow mt-1 shrink-0 text-[1.25rem] text-accent" />
      </div>
      {/* px-3 plus the controls' own padding lines the link icon up with the card icon. */}
      <div className="flex flex-wrap items-center gap-2 border-t border-line px-3 py-3">
        {list.wordCount > 0 ? (
          <Link
            to={`/lists/${list.id}/study`}
            aria-label={`Kartlarla çalış: ${list.title}`}
            className="relative z-10 inline-flex min-h-9 items-center gap-1.5 rounded-control px-2 text-small font-semibold no-underline hover:bg-accent-soft hover:text-on-accent-soft"
          >
            <CardsIcon aria-hidden="true" className="text-[1.1em]" />
            Kartlarla çalış
          </Link>
        ) : (
          <span className="px-2 text-small text-fg-muted">Önce kelime ekle</span>
        )}
        <span className="ml-auto flex flex-wrap gap-1">
          <Button
            className="relative z-10"
            size="sm"
            variant="ghost"
            aria-haspopup="dialog"
            aria-label={`${list.title} listesini yeniden adlandır`}
            onClick={(event) => open(list, 'rename', event.currentTarget)}
          >
            Yeniden adlandır
          </Button>
          <Button
            className="relative z-10"
            size="sm"
            variant="danger-ghost"
            aria-haspopup="dialog"
            aria-label={`${list.title} listesini sil`}
            onClick={(event) => open(list, 'delete', event.currentTarget)}
          >
            Sil
          </Button>
        </span>
      </div>
    </Card>
  );
}

export function CreateListPage() {
  useDocumentTitle('Yeni liste oluştur');
  const create = useCreateList();
  const navigate = useNavigate();
  return (
    <div className="grid max-w-2xl gap-6">
      <PageHeader
        back={{ to: '/lists', label: 'Listelerime dön' }}
        eyebrow="Listelerim"
        title="Yeni liste oluştur"
        description="Listene istediğin başlığı ver. Aynı başlıkla birden fazla liste oluşturabilirsin."
      />
      <Card>
        <TitleForm
          pending={create.isPending}
          serverError={create.error}
          submit={async (title) => {
            await create.mutateAsync(title);
            await navigate('/lists');
          }}
        />
      </Card>
    </div>
  );
}
