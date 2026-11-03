import { Link } from 'react-router';
import { ArrowRightIcon, CardsIcon, PlusIcon } from '../../components/ui/icons';
import { ListCover } from '../../components/ui/ListCover';
import { useLists } from '../../lib/lists';
import { ListsEmpty, ListsError, ListsLoading } from '../lists/ListStates';
import { SectionHeader, SectionLink } from './SectionHeader';

const steps = [
  {
    title: 'Liste oluştur',
    text: '“1. Hafta”, “Ekim” ya da “Algorithms” gibi istediğin başlığı ver.',
  },
  {
    title: 'Kelimelerini ekle',
    text: 'Her İngilizce kelimeye bir veya daha fazla Türkçe anlam yaz.',
  },
  {
    title: 'Farklı yöntemlerle çalış',
    text: 'Kelime kartları, yazma, dinleme ve alıştırmalarla tekrar et.',
  },
];

const updatedFormat = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short' });

export function ListsOverview() {
  const lists = useLists();
  return (
    <section aria-labelledby="lists-title" className="grid gap-5">
      <SectionHeader
        id="lists-title"
        title="Kelime listelerin"
        description="Son düzenlediğin listeler. Bir listeye girip kelimelerini yönetebilir ya da hemen çalışabilirsin."
        action={
          lists.data?.length ? <SectionLink to="/lists">Tüm listeler</SectionLink> : undefined
        }
      />
      {lists.isPending ? (
        <ListsLoading />
      ) : lists.isError ? (
        <ListsError
          error={lists.error}
          retry={() => {
            void lists.refetch();
          }}
        />
      ) : lists.data.length > 0 ? (
        <>
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {lists.data.slice(0, 4).map((list) => (
              <li
                key={list.id}
                className={
                  'group relative flex min-h-48 flex-col gap-4 rounded-card border border-line bg-surface-raised p-5 shadow-card ' +
                  'transition-[border-color,box-shadow,translate] duration-(--duration-base) ease-standard ' +
                  'has-[.row-link:hover]:-translate-y-0.5 has-[.row-link:hover]:border-accent has-[.row-link:hover]:shadow-raised motion-reduce:has-[.row-link:hover]:translate-y-0 ' +
                  'has-[.row-link:focus-visible]:outline-2 has-[.row-link:focus-visible]:outline-offset-2 has-[.row-link:focus-visible]:outline-focus'
                }
              >
                <div className="flex items-start justify-between gap-3">
                  <ListCover id={list.id} title={list.title} />
                  <span className="rounded-full bg-surface-sunken px-2.5 py-1 text-caption font-semibold text-fg tabular-nums">
                    {list.wordCount} kelime
                  </span>
                </div>
                <div className="grid min-w-0 gap-1">
                  <h3 className="text-h4 wrap-anywhere">
                    {/* The link's ::after covers the card; the study link sits above it. */}
                    <Link
                      to={`/lists/${list.id}`}
                      className="row-link text-fg no-underline outline-none after:absolute after:inset-0 after:rounded-card hover:underline"
                    >
                      {list.title}
                    </Link>
                  </h3>
                  <p className="text-small text-fg-muted">
                    Son düzenleme:{' '}
                    <time dateTime={list.updatedAt}>
                      {updatedFormat.format(new Date(list.updatedAt))}
                    </time>
                  </p>
                </div>
                <div className="mt-auto flex items-center justify-between gap-3">
                  {list.wordCount > 0 ? (
                    <Link
                      to={`/lists/${list.id}/study`}
                      aria-label={`${list.title} listesiyle kelime kartı çalış`}
                      className="relative z-10 inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border border-line-strong/60 bg-surface-raised px-3.5 text-small font-semibold text-fg no-underline transition-colors duration-(--duration-fast) ease-standard hover:border-accent hover:bg-accent-soft hover:text-on-accent-soft"
                    >
                      <CardsIcon aria-hidden="true" className="text-[1.05em]" />
                      Çalış
                    </Link>
                  ) : (
                    <span className="text-small font-medium text-fg-muted">
                      Kelime ekleyerek başla
                    </span>
                  )}
                  <ArrowRightIcon
                    aria-hidden="true"
                    className="shrink-0 text-[1.2rem] text-accent transition-transform duration-(--duration-base) ease-standard group-has-[.row-link:hover]:translate-x-1 motion-reduce:group-has-[.row-link:hover]:translate-x-0"
                  />
                </div>
              </li>
            ))}
          </ul>
          <Link
            to="/lists/new"
            className="group flex min-h-16 w-full items-center justify-center gap-3 rounded-card border-2 border-dashed border-line-strong/50 px-5 py-3 text-center font-semibold text-fg no-underline transition-[border-color,background-color] duration-(--duration-fast) ease-standard hover:border-accent hover:bg-accent-soft/60 hover:text-on-accent-soft"
          >
            <span
              aria-hidden="true"
              className="grid size-9 place-items-center rounded-full bg-accent-soft text-[1.15rem] text-on-accent-soft transition-transform duration-(--duration-base) ease-standard group-hover:scale-110 motion-reduce:group-hover:scale-100"
            >
              <PlusIcon />
            </span>
            Yeni liste oluştur
          </Link>
        </>
      ) : (
        <div className="@container">
          <div className="grid gap-5 @3xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
            <ListsEmpty headingLevel="h3" />
            <div className="grid content-start gap-5 rounded-panel border border-line bg-surface-raised p-6 shadow-card">
              <h3 className="text-h4 text-fg">Listeler nasıl kullanılacak?</h3>
              <ol className="grid gap-4">
                {steps.map((step, index) => (
                  <li key={step.title} className="flex gap-3.5">
                    <span
                      aria-hidden="true"
                      className="grid size-8 shrink-0 place-items-center rounded-full bg-[linear-gradient(140deg,#3b82f6,#1262b0)] text-small font-bold text-white shadow-[0_6px_12px_-6px_rgb(18_98_176/0.8)]"
                    >
                      {index + 1}
                    </span>
                    <span className="grid gap-0.5">
                      <span className="font-semibold text-fg">{step.title}</span>
                      <span className="text-small text-fg-muted">{step.text}</span>
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
