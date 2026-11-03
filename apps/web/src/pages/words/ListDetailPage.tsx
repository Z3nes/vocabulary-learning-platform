import { useState } from 'react';
import { useParams } from 'react-router';
import { Button } from '../../components/ui/Button';
import { ButtonLink } from '../../components/ui/ButtonLink';
import { EmptyState } from '../../components/ui/EmptyState';
import { FamilyBadge } from '../../components/ui/FamilyBadge';
import { headwordClass } from '../../components/ui/Headword';
import { BookIcon, PlusIcon } from '../../components/ui/icons';
import { ModeIcon } from '../../components/ui/modeIcons';
import { PageHeader } from '../../components/ui/PageHeader';
import { SearchField } from '../../components/ui/SearchField';
import { StatusNotice } from '../../components/ui/StatusNotice';
import { LoadingState } from '../../components/ui/states';
import { cn } from '../../lib/cn';
import { useList } from '../../lib/lists';
import { matchesSearch, searchKey } from '../../lib/search';
import { useActiveSession } from '../../lib/study';
import { useWords, type Word } from '../../lib/words';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import { ListsError } from '../lists/ListStates';
import { studyPaths } from '../study/studyFormat';
import { WordDialog, type WordTarget } from './WordDialog';

/** From this many words on, a filter helps more than it clutters. */
const FILTER_FROM = 8;

export function ListDetailPage() {
  const { id = '' } = useParams();
  const list = useList(id);
  const words = useWords(id);
  const [target, setTarget] = useState<WordTarget>();
  const [notice, setNotice] = useState('');
  // Keep an engaged filter mounted, including after deletion and clearing.
  const [query, setQuery] = useState<string | null>(null);
  // Fade the word region in only when it arrives after the page appeared; words
  // that are already cached appear with the page's own route entrance instead.
  const [fadeInWords] = useState(() => words.isPending);
  useDocumentTitle(list.data?.title ?? 'Liste');
  const key = searchKey(query ?? '');
  const visible =
    words.data?.filter((word) =>
      matchesSearch(key, [word.english, ...word.meanings.map((meaning) => meaning.turkish)]),
    ) ?? [];
  return (
    <div className="grid gap-7">
      <PageHeader
        back={{ to: '/lists', label: 'Listelerime dön' }}
        eyebrow="Liste"
        title={list.data?.title ?? 'Liste'}
        // Always rendered, so the header keeps its height while the list loads.
        description={
          <p>
            {list.data ? `${list.data.wordCount} kelime · ` : null}Kendi kelimelerini ve anlamlarını
            yönet.
          </p>
        }
        // The actions only need the list id; showing them while loading keeps the header stable.
        actions={
          !list.isError ? (
            <>
              <Button
                aria-haspopup="dialog"
                icon={<PlusIcon />}
                onClick={(event) => {
                  setNotice('');
                  setTarget({ action: 'add', trigger: event.currentTarget });
                }}
              >
                Kelime ekle
              </Button>
              <Button
                variant="secondary"
                aria-haspopup="dialog"
                onClick={(event) => {
                  setNotice('');
                  setTarget({ action: 'bulk', trigger: event.currentTarget });
                }}
              >
                Toplu ekle
              </Button>
            </>
          ) : null
        }
      />
      {list.data && list.data.wordCount > 0 ? <StudyLauncher listId={id} /> : null}
      <StatusNotice message={notice} />
      {list.isError ? (
        <ListsError
          error={list.error}
          retry={() => {
            void list.refetch();
          }}
        />
      ) : list.isPending ? (
        <LoadingState rows={4}>Liste yükleniyor…</LoadingState>
      ) : words.isPending ? (
        <LoadingState rows={4}>Kelimelerin yükleniyor…</LoadingState>
      ) : words.isError ? (
        <ListsError
          error={words.error}
          retry={() => {
            void words.refetch();
          }}
        />
      ) : (
        // One fade for the whole region; word rows never animate individually.
        <div className={cn('grid gap-4', fadeInWords && 'fade-in')}>
          {!words.data.length ? (
            <EmptyState
              icon={<BookIcon />}
              headingLevel="h2"
              title="Bu listende henüz kelime yok"
              description="“Kelime ekle” ile tek tek ekleyebilir ya da “Toplu ekle” ile bir tablodaki kelime ve anlam sütunlarını birlikte yapıştırabilirsin."
            />
          ) : (
            <>
              {words.data.length >= FILTER_FROM || query !== null ? (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <SearchField
                    label="Kelimelerde ara"
                    value={query ?? ''}
                    onFocus={() => setQuery((value) => value ?? '')}
                    onChange={(event) => setQuery(event.target.value)}
                    className="w-full sm:max-w-sm"
                  />
                  <p aria-live="polite" className="text-small text-fg-muted">
                    {key ? `Gösterilen: ${visible.length} / ${words.data.length}` : ''}
                  </p>
                </div>
              ) : null}
              {visible.length ? (
                <ul className="grid divide-y divide-line overflow-hidden rounded-panel border border-line bg-surface-raised shadow-card">
                  {visible.map((word) => (
                    <WordRow
                      key={word.id}
                      word={word}
                      edit={(trigger) => setTarget({ action: 'edit', word, trigger })}
                      remove={(trigger) => setTarget({ action: 'delete', word, trigger })}
                    />
                  ))}
                </ul>
              ) : (
                <p className="rounded-card border border-dashed border-line-strong bg-surface-raised px-5 py-6 text-body text-fg">
                  “{query?.trim()}” ile eşleşen bir kelime ya da anlam yok.
                </p>
              )}
            </>
          )}
        </div>
      )}
      {target ? (
        <WordDialog
          key={'word' in target ? `${target.action}-${target.word.id}` : target.action}
          listId={id}
          target={target}
          close={() => setTarget(undefined)}
          saved={setNotice}
        />
      ) : null}
    </div>
  );
}

/** Every study mode for this list in one place; flashcards are the primary entry. */
function StudyLauncher({ listId }: { listId: string }) {
  const active = useActiveSession(listId);
  const encoded = encodeURIComponent(listId);
  return (
    <section
      aria-labelledby="list-study-title"
      className="grid gap-4 rounded-panel border border-line bg-surface-raised p-5 shadow-card sm:p-6"
    >
      <div className="flex items-center gap-3">
        <FamilyBadge family="study" size="sm" />
        <h2 id="list-study-title" className="text-h4 text-fg">
          Bu listeyle çalış
        </h2>
      </div>
      {/* Phones: one column of full-width buttons instead of a ragged wrap. */}
      <div className="grid gap-2.5 sm:flex sm:flex-wrap sm:items-center">
        {/* An unfinished session is resumed, never replaced by a new one. */}
        {active.data ? (
          <ButtonLink
            to={studyPaths.session(active.data.id)}
            variant="mode"
            mode="flashcards"
            icon={<ModeIcon mode="flashcards" />}
          >
            Çalışmaya devam et
          </ButtonLink>
        ) : (
          <ButtonLink
            to={studyPaths.setup(listId)}
            variant="mode"
            mode="flashcards"
            icon={<ModeIcon mode="flashcards" />}
          >
            Çalışmaya başla
          </ButtonLink>
        )}
        <ButtonLink
          variant="mode-soft"
          mode="written"
          to={`/lists/${encoded}/written`}
          icon={<ModeIcon mode="written" />}
        >
          Yazılı Cevap
        </ButtonLink>
        <ButtonLink
          variant="mode-soft"
          mode="listening"
          to={`/lists/${encoded}/listening`}
          icon={<ModeIcon mode="listening" />}
        >
          Dinle ve Yaz
        </ButtonLink>
        <ButtonLink
          variant="mode-soft"
          mode="review"
          to={`/lists/${encoded}/review`}
          icon={<ModeIcon mode="review" />}
        >
          Zorlandıklarımı Çalış
        </ButtonLink>
        <ButtonLink
          variant="mode-soft"
          mode="mixed"
          to={`/study/mixed?list=${encoded}`}
          icon={<ModeIcon mode="mixed" />}
        >
          Karma Çalışma
        </ButtonLink>
        <ButtonLink variant="ghost" to={`/games?list=${encoded}`} icon={<ModeIcon mode="quiz" />}>
          Bu listeyle alıştırma yap
        </ButtonLink>
      </div>
      <p className="text-small text-fg-muted">
        Kelime kartları kelimelerin hepsiyle ya da bir bölümüyle çalışır; yarım kalan çalışmana her
        zaman buradan dönebilirsin.
      </p>
    </section>
  );
}

function WordRow({
  word,
  edit,
  remove,
}: {
  word: Word;
  edit: (trigger: HTMLElement) => void;
  remove: (trigger: HTMLElement) => void;
}) {
  return (
    <li
      id={`word-${word.id}`}
      className="grid gap-x-6 gap-y-2.5 px-5 py-4 sm:grid-cols-[minmax(0,15rem)_minmax(0,1fr)_auto] sm:items-center"
    >
      <h2 lang="en" tabIndex={-1} className={cn(headwordClass, 'text-h3 text-fg wrap-anywhere')}>
        {word.english}
      </h2>
      <ul aria-label={`${word.english} Türkçe anlamları`} className="flex flex-wrap gap-1.5">
        {word.meanings.map((meaning) => (
          <li
            key={meaning.id}
            className="max-w-full rounded-md bg-surface-sunken px-2.5 py-1 text-body leading-snug text-fg wrap-anywhere"
          >
            {meaning.turkish}
          </li>
        ))}
      </ul>
      <div className="-ml-2 flex flex-wrap gap-1 sm:ml-0 sm:justify-end">
        <Button
          variant="ghost"
          size="sm"
          aria-haspopup="dialog"
          aria-label={`${word.english} kelimesini düzenle`}
          onClick={(event) => edit(event.currentTarget)}
        >
          Düzenle
        </Button>
        <Button
          variant="danger-ghost"
          size="sm"
          aria-haspopup="dialog"
          aria-label={`${word.english} kelimesini sil`}
          onClick={(event) => remove(event.currentTarget)}
        >
          Sil
        </Button>
      </div>
    </li>
  );
}
