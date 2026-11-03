import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from 'react';
import { useSearchParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '../../components/ui/Button';
import { ButtonLink } from '../../components/ui/ButtonLink';
import { sheetClass, sheetSectionClass } from '../../components/ui/Card';
import { SelectField } from '../../components/ui/fields';
import { headwordClass } from '../../components/ui/Headword';
import { AlertIcon, CheckIcon, HistoryIcon, InfoIcon, PlusIcon } from '../../components/ui/icons';
import { ModeArt } from '../../components/ui/ModeArt';
import { ModeIcon } from '../../components/ui/modeIcons';
import { PageHeader } from '../../components/ui/PageHeader';
import { ProgressBar } from '../../components/ui/Progress';
import { StatGrid, type StatItem } from '../../components/ui/Stats';
import { cn } from '../../lib/cn';
import { useFocusOnChange } from '../../lib/focus';
import { useLists } from '../../lib/lists';
import { wordsApi } from '../../lib/words';
import {
  gameNames,
  saveCompletion,
  snapshot,
  type Completion,
  type GameItem,
  type GameType,
  type Snapshot,
} from '../../lib/games';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import { ErrorPanel, LoadingNotice } from '../study/parts';
import { gameGuides } from './gameGuides';

/** Lets a round that cannot be built send the student back to the list choice. */
const ChooseAnotherList = createContext<(() => void) | null>(null);

export function GameFrame({
  type,
  Play,
}: {
  type: GameType;
  Play: ComponentType<{ words: Snapshot[]; done: (items: GameItem[]) => void }>;
}) {
  const [params] = useSearchParams();
  const [listId, setListId] = useState(params.get('list') ?? '');
  const [words, setWords] = useState<Snapshot[] | null>(null);
  const [completion, setCompletion] = useState<Completion | null>(null);
  const lists = useLists();
  const candidates = useQuery({
    queryKey: ['game-candidates', listId],
    queryFn: ({ signal }) => wordsApi.all(listId, signal),
    enabled: !!listId && !words,
    staleTime: 0,
  });
  const client = useQueryClient();
  const pending = useRef(false);
  const completed = useRef(false);
  const save = useMutation({
    mutationFn: saveCompletion,
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['activity'] });
    },
  });
  const id = useId();
  const setupHeading = useRef<HTMLHeadingElement>(null);
  const refocusSetup = useRef(false);
  useDocumentTitle(gameNames[type]);
  useEffect(() => {
    if (words || !refocusSetup.current) return;
    refocusSetup.current = false;
    setupHeading.current?.focus();
  }, [words]);
  const submit = async (input: Completion) => {
    if (pending.current) return;
    pending.current = true;
    try {
      await save.mutateAsync(input);
    } catch {
      /* ErrorPanel provides an explicit same-payload retry. */
    } finally {
      pending.current = false;
    }
  };
  const done = (items: GameItem[]) => {
    if (completed.current) return;
    completed.current = true;
    const input: Completion = {
      completionId: crypto.randomUUID(),
      listId,
      gameType: type,
      status: 'completed',
      items: structuredClone(items),
    };
    setCompletion(input);
    void submit(input);
  };
  // Back to the list choice. Offered only when nothing is left to save: before a
  // round starts (an unsuitable list) or after the result was stored.
  const restart = () => {
    completed.current = false;
    refocusSetup.current = true;
    save.reset();
    setCompletion(null);
    setWords(null);
  };
  const listTitle = lists.data?.find((list) => list.id === listId)?.title;
  const listQuery = listId ? `?list=${encodeURIComponent(listId)}` : '';
  return (
    <div data-mode={type} className="mx-auto grid w-full max-w-4xl gap-6">
      <PageHeader
        variant="session"
        mode={type}
        back={{ to: `/games${listQuery}`, label: 'Alıştırmalara dön' }}
        actions={
          <ButtonLink to={listId ? `/lists/${listId}` : '/lists'} variant="ghost" size="sm">
            {listId ? 'Listene dön' : 'Listelerin'}
          </ButtonLink>
        }
        eyebrow="Alıştırmalar"
        title={gameNames[type]}
        description={
          words && listTitle ? (
            <p>
              Liste: <strong className="font-semibold text-fg">{listTitle}</strong>
            </p>
          ) : (
            gameGuides[type].description
          )
        }
      />
      {!words ? (
        <form
          aria-labelledby={`${id}-setup`}
          className={cn(sheetClass, 'grid overflow-hidden shadow-raised')}
          onSubmit={(e) => {
            e.preventDefault();
            if (candidates.data && !candidates.isFetching) setWords(candidates.data.map(snapshot));
          }}
        >
          {/* The game's entry: what a round asks for, beside a miniature of the board. */}
          <div className="mode-art-stage grid items-center gap-4 border-b border-(--mode-soft) px-5 py-6 sm:grid-cols-[minmax(0,1fr)_14rem] sm:px-7">
            <div className="grid min-w-0 gap-2">
              <h2 id={`${id}-setup`} ref={setupHeading} tabIndex={-1} className="text-h2 text-fg">
                Turu hazırla
              </h2>
              <p className="flex items-start gap-2 text-body text-fg">
                <InfoIcon
                  aria-hidden="true"
                  className="mt-1 shrink-0 text-[1.05rem] text-(--mode-ink)"
                />
                {gameGuides[type].requirement}
              </p>
            </div>
            <div aria-hidden="true" className="hidden h-32 sm:block">
              <ModeArt mode={type} />
            </div>
          </div>
          <div className={sheetSectionClass}>
            {lists.isPending ? (
              <LoadingNotice>Listelerin yükleniyor…</LoadingNotice>
            ) : lists.isError ? (
              <ErrorPanel error={lists.error} retry={() => void lists.refetch()} />
            ) : !lists.data.length ? (
              <div className="grid justify-items-start gap-3">
                <p className="text-body text-fg">
                  Oynamak için önce kelimelerini bir listeye eklemelisin.
                </p>
                <ButtonLink to="/lists/new" icon={<PlusIcon />}>
                  Önce bir liste oluştur
                </ButtonLink>
              </div>
            ) : (
              <div className="max-w-md">
                <SelectField
                  label="Kelime listesi"
                  hint="Başlayınca kelimelerin bu tur için sabit kalır."
                  value={listId}
                  onChange={(e) => setListId(e.target.value)}
                >
                  <option value="">Liste seç</option>
                  {lists.data.map((list) => (
                    <option key={list.id} value={list.id}>
                      {list.title}
                    </option>
                  ))}
                </SelectField>
              </div>
            )}
          </div>
          {lists.data?.length ? (
            <div className={cn(sheetSectionClass, 'border-t border-line bg-surface/70')}>
              {!listId ? (
                <p className="text-body text-fg">Başlamak için bir liste seç.</p>
              ) : candidates.isPending ? (
                <LoadingNotice>Kelimelerin yükleniyor…</LoadingNotice>
              ) : candidates.isError ? (
                <ErrorPanel error={candidates.error} retry={() => void candidates.refetch()} />
              ) : (
                <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
                  <Button
                    type="submit"
                    size="lg"
                    variant="mode"
                    loading={candidates.isFetching}
                    icon={<ModeIcon mode={type} />}
                  >
                    Oyuna başla
                  </Button>
                  <p className="text-small text-fg-muted">
                    Bu listede{' '}
                    <strong className="font-semibold text-fg tabular-nums">
                      {candidates.data.length}
                    </strong>{' '}
                    kelime var.
                  </p>
                </div>
              )}
              <p className="flex items-start gap-2 text-small text-fg">
                <InfoIcon className="mt-0.5 shrink-0 text-[1.05rem] text-fg-muted" />
                Yarım kalan oyun kaydedilmez. Turu bitirdiğinde sonucun çalışma geçmişine eklenir.
              </p>
            </div>
          ) : null}
        </form>
      ) : completion ? (
        <RoundComplete
          type={type}
          completion={completion}
          saving={save.isPending}
          saved={save.isSuccess}
          error={save.isError ? save.error : null}
          retry={() => void submit(completion)}
          restart={restart}
        />
      ) : (
        <ChooseAnotherList.Provider value={restart}>
          <Play words={words} done={done} />
        </ChooseAnotherList.Provider>
      )}
    </div>
  );
}

const outcomeLabels: Record<GameItem['outcome'], string> = {
  correct: 'Doğru',
  incorrect: 'Yanlış',
  revealed: 'Cevabı gösterildi',
  matched: 'Eşleştirildi',
};

/** Personal counts for the finished round (outcomes only, never points). */
function roundStats(type: GameType, items: GameItem[]): StatItem[] {
  const count = (test: (item: GameItem) => boolean) => items.filter(test).length;
  if (type === 'quiz')
    return [
      { label: 'Doğru', value: count((i) => i.outcome === 'correct'), tone: 'success' },
      { label: 'Yanlış', value: count((i) => i.outcome === 'incorrect'), tone: 'highlight' },
    ];
  if (type === 'assembly')
    return [
      {
        label: 'Doğru oluşturduğun',
        value: count((i) => i.outcome === 'correct'),
        tone: 'success',
      },
      {
        label: 'Cevabı gösterilen',
        value: count((i) => i.outcome === 'revealed'),
        tone: 'highlight',
      },
    ];
  return [
    { label: 'Eşleştirilen çift', value: items.length, tone: 'success' },
    { label: 'İlk denemede eşleşen', value: count((i) => i.attempts <= 1), tone: 'info' },
  ];
}

function RoundComplete({
  type,
  completion,
  saving,
  saved,
  error,
  retry,
  restart,
}: {
  type: GameType;
  completion: Completion;
  saving: boolean;
  saved: boolean;
  error: unknown;
  retry: () => void;
  restart: () => void;
}) {
  const id = useId();
  const heading = useFocusOnChange<HTMLHeadingElement>(completion.completionId);
  const items = completion.items;
  return (
    <section aria-labelledby={`${id}-title`} className="grid gap-6">
      <div className={cn(sheetClass, 'grid overflow-hidden shadow-raised')}>
        <div className="mode-art-stage grid gap-6 border-b border-(--mode-soft) p-5 sm:p-8">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-4">
            {/* A one-time settle and ring (reduced motion: static). Decorative. */}
            <span
              aria-hidden="true"
              className="celebrate grid size-16 shrink-0 place-items-center rounded-full bg-success text-[1.9rem] text-white shadow-[0_0_0_6px_rgb(255_255_255/0.85),0_16px_30px_-12px_rgb(18_107_66/0.7)]"
            >
              <CheckIcon strokeWidth={3} />
            </span>
            <div className="grid min-w-0 flex-1 basis-64 gap-1">
              <h2 id={`${id}-title`} ref={heading} tabIndex={-1} className="text-h1 text-fg">
                Tur tamamlandı
              </h2>
              <p className="text-body text-fg">
                {items.length} kelimeyle çalıştın. Bu oyun kelime kartlarındaki tekrar önceliğini
                değiştirmez.
              </p>
            </div>
          </div>
          <StatGrid label="Tur sonucu" items={roundStats(type, items)} />
        </div>
        <div className={cn(sheetSectionClass, 'bg-surface/70')}>
          {saving ? (
            <LoadingNotice>Sonucun kaydediliyor…</LoadingNotice>
          ) : error ? (
            <>
              <p className="text-body text-fg">
                Kaydı doğrulayamadık. Aynı sonucu tekrar gönderebilirsin; ikinci bir kayıt oluşmaz.
                Bu sayfayı açık tut.
              </p>
              <ErrorPanel error={error} retry={retry} />
            </>
          ) : saved ? (
            <p role="status" className="flex items-start gap-2.5 text-body text-fg">
              <CheckIcon strokeWidth={2.5} className="mt-0.5 shrink-0 text-[1.2rem] text-success" />
              Sonucun kaydedildi. Geçmişinden tekrar görebilirsin.
            </p>
          ) : null}
          <div className="flex flex-wrap gap-3">
            {saved ? (
              <Button variant="mode" size="lg" onClick={restart} icon={<ModeIcon mode={type} />}>
                Yeni tur başlat
              </Button>
            ) : null}
            <ButtonLink
              to="/history"
              variant="secondary"
              size={saved ? 'lg' : 'md'}
              icon={<HistoryIcon />}
            >
              Son çalışmalarını gör
            </ButtonLink>
          </div>
        </div>
      </div>
      <section aria-labelledby={`${id}-words`} className="grid gap-3">
        <h3 id={`${id}-words`} className="text-h3 text-fg">
          Kelimelerin
        </h3>
        <ul className={cn(sheetClass, 'grid divide-y divide-line overflow-hidden')}>
          {items.map((item, i) => {
            const good = item.outcome === 'correct' || item.outcome === 'matched';
            return (
              <li
                key={i}
                className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-2 px-5 py-4 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:px-6"
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    'grid size-9 place-items-center rounded-full text-[1.05rem]',
                    good ? 'bg-success-soft text-success' : 'bg-highlight text-on-highlight',
                  )}
                >
                  {good ? <CheckIcon strokeWidth={2.75} /> : <AlertIcon strokeWidth={2.5} />}
                </span>
                <div className="grid min-w-0 gap-0.5 wrap-anywhere">
                  <span lang="en" className={cn(headwordClass, 'text-h4 text-fg')}>
                    {item.english}
                  </span>
                  <span className="text-body text-fg-muted">{item.meanings.join(' / ')}</span>
                </div>
                <span
                  className={cn(
                    'col-start-2 inline-flex w-fit items-center gap-1.5 rounded-full border px-3 py-1 text-small font-semibold sm:col-start-3',
                    good
                      ? 'border-success/40 bg-success-soft text-fg'
                      : 'border-on-highlight/30 bg-highlight text-on-highlight',
                  )}
                >
                  {outcomeLabels[item.outcome]} · {item.attempts} deneme
                </span>
              </li>
            );
          })}
        </ul>
      </section>
    </section>
  );
}

/** Shown in place of a round when the chosen list cannot support it. */
export function Unsuitable({ children }: { children: ReactNode }) {
  const chooseAnother = useContext(ChooseAnotherList);
  const heading = useFocusOnChange<HTMLHeadingElement>(null);
  return (
    <div
      className={cn(
        sheetClass,
        'grid justify-items-start gap-5 overflow-hidden p-5 sm:p-7',
        'bg-[linear-gradient(180deg,rgb(253_240_200/0.45),var(--sem-surface-raised)_70%)]',
      )}
    >
      <div role="status" className="flex items-start gap-4">
        <span
          aria-hidden="true"
          className="grid size-12 shrink-0 place-items-center rounded-full bg-highlight text-[1.45rem] text-on-highlight shadow-[0_0_0_5px_rgb(255_255_255/0.9)]"
        >
          <AlertIcon />
        </span>
        <div className="grid min-w-0 gap-1.5">
          <h2 ref={heading} tabIndex={-1} className="text-h3 text-fg">
            Bu listeyle tur oluşturulamadı
          </h2>
          <p className="text-body text-fg">{children}</p>
          <p className="text-body text-fg-muted">
            Listene dönüp uygun kelimeler ekleyebilir veya başka bir liste seçebilirsin.
          </p>
        </div>
      </div>
      {chooseAnother ? (
        <Button variant="secondary" onClick={chooseAnother} className="sm:ml-16">
          Başka bir liste seç
        </Button>
      ) : null}
    </div>
  );
}

/**
 * "Soru 3 / 10" above the round's track. The text states the progress; the track
 * repeats it (aria-hidden): one segment per item in short rounds, else a bar.
 */
export function RoundProgress({
  children,
  value,
  max,
}: {
  children: ReactNode;
  value: number;
  max: number;
}) {
  return (
    <div className="grid gap-2.5">
      <p className="text-small font-semibold text-fg tabular-nums">{children}</p>
      {max > 0 && max <= 12 ? (
        <div aria-hidden="true" className="flex gap-1.5">
          {Array.from({ length: max }, (_, i) => (
            <span
              key={i}
              className={cn(
                'h-2.5 flex-1 rounded-full transition-[background-color,box-shadow] duration-(--duration-base) ease-standard',
                i < value
                  ? 'bg-(--mode-deep) bg-(image:--mode-gradient)'
                  : i === value
                    ? 'bg-(--mode-soft) shadow-[inset_0_0_0_1.5px_var(--mode-solid)]'
                    : 'bg-surface-sunken shadow-[inset_0_0_0_1px_var(--sem-line)]',
              )}
            />
          ))}
        </div>
      ) : (
        <ProgressBar value={value} max={max} tone="mode" />
      )}
    </div>
  );
}
