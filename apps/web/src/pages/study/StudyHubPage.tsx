import { Link } from 'react-router';
import { ButtonLink } from '../../components/ui/ButtonLink';
import { FamilyBadge } from '../../components/ui/FamilyBadge';
import { HubHero } from '../../components/ui/HubHero';
import { ArrowRightIcon, PlusIcon } from '../../components/ui/icons';
import { ListCover } from '../../components/ui/ListCover';
import { ModeIcon, ModeTile, type Mode } from '../../components/ui/modeIcons';
import { ModeLauncher } from '../../components/ui/ModeLauncher';
import { useLists } from '../../lib/lists';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import { ListsEmpty, ListsError, ListsLoading } from '../lists/ListStates';
import { studyPaths } from './studyFormat';

/** The three list-based modes; their ids are the dashboard's deep-link targets. */
const listModes: { mode: Mode; id: string; title: string; description: string }[] = [
  {
    mode: 'flashcards',
    id: 'flashcards-mode-title',
    title: 'Kelime kartları',
    description: 'Kartı çevir, bildiğini ya da bilemediğini işaretle.',
  },
  {
    mode: 'written',
    id: 'written-lists-title',
    title: 'Yazılı Cevap',
    description: 'Türkçe anlamların tamamından İngilizce karşılığını yaz.',
  },
  {
    mode: 'listening',
    id: 'listening-lists-title',
    title: 'Dinle ve Yaz',
    description: 'İngilizce ifadeyi dinle ve duyduğun ifadeyi yaz.',
  },
];

/**
 * "Kelime Çalış": every list once, with its three study modes side by side, plus
 * the two modes that work across all lists. A list's study page then offers to
 * resume its unfinished session or start a new one.
 */
export function StudyHubPage() {
  const lists = useLists();
  useDocumentTitle('Kelime Çalış');
  const hasLists = Boolean(lists.data?.length);
  return (
    <div className="grid gap-12">
      <HubHero
        eyebrow="Hatırla, yaz, dinle"
        title="Kelime Çalış"
        description="Bir liste ve yöntem seç. Yarım kalan bir çalışmana da aynı yerden, kaldığın yerden devam edebilirsin."
        tone="study"
        modes={['written', 'listening', 'flashcards']}
      />

      {hasLists ? (
        <section aria-labelledby="all-lists-title" className="grid gap-5">
          <h2 id="all-lists-title" className="text-h2 text-fg">
            Tüm listelerinle
          </h2>
          <ul className="grid gap-4 md:grid-cols-2">
            <ModeLauncher
              mode="review"
              title="Zorlandıklarımı Çalış"
              description="Tekrar önceliği olan kelimelerini kelime kartlarıyla yeniden çalış."
              to="/study/review"
            />
            <ModeLauncher
              mode="mixed"
              title="Karma Çalışma"
              description="Kart, yazma, dinleme ve seçenekli soruları tek çalışmada birleştir."
              to="/study/mixed"
            />
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="study-lists-title" className="grid gap-5">
        <div className="grid gap-1">
          <h2 id="study-lists-title" className="text-h2 text-fg">
            Listelerin
          </h2>
          <p className="text-body text-fg-muted">
            Her liste için üç yöntem var. Çalışmak istediğin listenin yanındaki yöntemi seç.
          </p>
        </div>
        {hasLists ? (
          <ul
            aria-label="Yöntemler"
            className="grid gap-px overflow-hidden rounded-card border border-line bg-line shadow-card md:grid-cols-3"
          >
            {listModes.map((item) => (
              <li
                key={item.mode}
                data-mode={item.mode}
                className="flex items-start gap-3.5 bg-surface-raised p-4 sm:p-5"
              >
                <ModeTile mode={item.mode} size="sm" tone="solid" />
                <div className="grid gap-0.5">
                  <h3 id={item.id} className="text-h4 text-fg">
                    {item.title}
                  </h3>
                  <p className="text-small text-fg-muted">{item.description}</p>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
        {lists.isPending ? (
          <ListsLoading />
        ) : lists.isError ? (
          <ListsError
            error={lists.error}
            retry={() => {
              void lists.refetch();
            }}
          />
        ) : !lists.data.length ? (
          <ListsEmpty headingLevel="h3" />
        ) : (
          <ul className="grid gap-3">
            {lists.data.map((list) => (
              <li
                key={list.id}
                className="grid items-center gap-x-5 gap-y-4 rounded-card border border-line bg-surface-raised p-4 shadow-card sm:grid-cols-[auto_minmax(0,1fr)] sm:p-5 xl:grid-cols-[auto_minmax(0,1fr)_auto]"
              >
                <ListCover id={list.id} title={list.title} size="lg" className="hidden sm:grid" />
                <div className="grid min-w-0 gap-1">
                  <p className="text-h4 text-fg wrap-anywhere">{list.title}</p>
                  {list.wordCount ? (
                    <p className="text-small text-fg-muted">{list.wordCount} kelime</p>
                  ) : null}
                </div>
                {list.wordCount ? (
                  <div className="grid gap-2 sm:col-span-2 sm:flex sm:flex-wrap xl:col-span-1 xl:justify-end">
                    <ButtonLink
                      variant="mode"
                      mode="flashcards"
                      to={studyPaths.setup(list.id)}
                      aria-label={`${list.title} · Kelime kartlarıyla çalış`}
                      icon={<ModeIcon mode="flashcards" />}
                    >
                      Kelime kartları
                    </ButtonLink>
                    <ButtonLink
                      variant="mode-soft"
                      mode="written"
                      to={`/lists/${encodeURIComponent(list.id)}/written`}
                      aria-label={`${list.title} · Yazılı Cevap`}
                      icon={<ModeIcon mode="written" />}
                    >
                      Yazılı Cevap
                    </ButtonLink>
                    <ButtonLink
                      variant="mode-soft"
                      mode="listening"
                      to={`/lists/${encodeURIComponent(list.id)}/listening`}
                      aria-label={`${list.title} · Dinle ve Yaz`}
                      icon={<ModeIcon mode="listening" />}
                    >
                      Dinle ve Yaz
                    </ButtonLink>
                  </div>
                ) : (
                  <Link
                    to={`/lists/${encodeURIComponent(list.id)}`}
                    aria-label={`${list.title} · Henüz kelime yok · Kelime ekle`}
                    className="inline-flex min-h-11 items-center gap-2 justify-self-start rounded-control border border-dashed border-line-strong/70 px-4 font-semibold no-underline transition-[background-color,border-color] duration-(--duration-fast) ease-standard hover:border-accent hover:bg-accent-soft sm:col-span-2 xl:col-span-1 xl:justify-self-end"
                  >
                    <PlusIcon aria-hidden="true" />
                    Henüz kelime yok · Kelime ekle
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="panel-practice flex flex-wrap items-center gap-x-5 gap-y-4 p-5 sm:p-6">
        <FamilyBadge family="practice" />
        <p className="min-w-0 flex-1 basis-64 text-body text-fg">
          Klasik test, Eşleştirme, Kelime Oluşturma, Hafıza Oyunu ve bulmacalar için Alıştırmalar
          sayfasına geç.
        </p>
        <ButtonLink to="/games" variant="secondary" className="pr-4">
          Alıştırmalar
          <ArrowRightIcon aria-hidden="true" className="ml-1.5 inline-block align-[-0.125em]" />
        </ButtonLink>
      </div>
    </div>
  );
}
